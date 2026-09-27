"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { messageSchema, guestThreadSchema, supportGuestTokenSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateSupportToken,
  hashSupportToken,
  isSupportMediaPathForThread
} from "@/lib/support/token";
import { createSupportUploadTicket, removeSupportMedia } from "@/lib/support/media";
import { authenticateGuest, markSupportThreadReadForProfile, SUPPORT_MESSAGE_COLUMNS, toThreadMessage } from "@/lib/support/queries";
import { signSupportMedia } from "@/lib/support/media";
import { readerKeyForProfile } from "@/lib/support/reader";
import {
  GUEST_THREAD_COOKIE,
  guestThreadOptions,
  serializeGuestThreadPointer
} from "@/lib/support/guest-session";
import type { ActionState } from "@/lib/types";

const ok: ActionState = { ok: true, message: "" };
const fail = (message: string): ActionState => ({ ok: false, message });

type SupportKind = "text" | "voice" | "image" | "video";

/* ------------------------------------------------------------------ */
/* Rate limiting                                                        */
/* ------------------------------------------------------------------ */

/**
 * In-process sliding window keyed by IP. The public entry points are the only
 * callers: a guest can create threads and post messages with no account and no
 * session, so this is the only brake on bulk spam.
 */
async function guestLimit(max: number, windowMs: number) {
  const h = await headers();
  return rateLimit({
    request: { headers: h, nextUrl: { pathname: "/support" } },
    max,
    windowMs
  });
}

/* ------------------------------------------------------------------ */
/* Guest: create a thread                                               */
/* ------------------------------------------------------------------ */

export type CreateGuestThreadResult = ActionState & {
  threadId?: string;
  /** Plain capability token. Returned exactly once — only its hash is stored. */
  token?: string;
};

export async function createGuestThreadAction(
  _state: ActionState,
  formData: FormData
): Promise<CreateGuestThreadResult> {
  const limit = await guestLimit(3, 60 * 60 * 1000);
  if (!limit.allowed) return fail("محاولات كثيرة جدًا. استنى شوية وجرّب تاني.");

  const parsed = guestThreadSchema.safeParse({
    guestName: formData.get("guestName"),
    guestCode: formData.get("guestCode"),
    body: formData.get("body"),
    website: formData.get("website") ?? undefined
  });

  // A filled honeypot is a bot, not a user. Fail with the same generic message
  // as a bad payload so the response does not confirm the trap exists.
  if (!parsed.success) return fail("اكتب اسمك وكودك ورسالتك بشكل صحيح.");

  const token = generateSupportToken();
  const tokenHash = hashSupportToken(token);
  const admin = createSupabaseAdminClient();

  const { data: thread, error: threadError } = await admin
    .from("support_threads")
    .insert({
      profile_id: null,
      guest_name: parsed.data.guestName,
      guest_code: parsed.data.guestCode,
      guest_token_hash: tokenHash
    })
    .select("id")
    .single();

  if (threadError || !thread) return fail("تعذر بدء المحادثة. جرّب تاني.");

  const { error: messageError } = await admin.from("support_messages").insert({
    thread_id: thread.id,
    author_profile_id: null,
    author_kind: "guest",
    guest_name: parsed.data.guestName,
    kind: "text",
    body: parsed.data.body
  });

  if (messageError) {
    // Don't leave an empty thread behind if the first message failed.
    await admin.from("support_threads").delete().eq("id", thread.id);
    return fail("تعذر بدء المحادثة. جرّب تاني.");
  }

  // Remember the pointer so /support can only ever offer "continue" from here on.
  // The token goes in an httpOnly cookie: the server renders the resume link, so
  // no client script ever needs to read it back.
  (await cookies()).set(
    GUEST_THREAD_COOKIE,
    serializeGuestThreadPointer(thread.id, token),
    guestThreadOptions()
  );

  return { ...ok, threadId: thread.id, token };
}

/**
 * The escape hatch for a guest whose saved thread is gone — purged at sign-in, or
 * a link that was never valid. Without clearing the cookie, `/support` would keep
 * rendering continue-only and send them straight back to the dead thread.
 */
export async function clearGuestThreadAction() {
  (await cookies()).delete(GUEST_THREAD_COOKIE);
  redirect("/support");
}

/* ------------------------------------------------------------------ */
/* Guest: upload ticket                                                 */
/* ------------------------------------------------------------------ */

/**
 * Issues a signed upload target so a guest can push media without a session.
 * Authorization already happened against the capability token.
 */
export async function createGuestUploadTicketAction(
  threadId: string,
  token: string,
  extension: string
): Promise<{ path: string; signedUrl: string; token: string } | null> {
  const parsed = supportGuestTokenSchema.safeParse({ threadId, token });
  if (!parsed.success) return null;

  const auth = await authenticateGuest(parsed.data.threadId, parsed.data.token);
  if (!auth) return null;

  const limit = await guestLimit(40, 60 * 60 * 1000);
  if (!limit.allowed) return null;

  // createSupportUploadTicket strips the extension down to [a-z0-9]{0,8}, so a
  // caller-supplied value cannot escape the object's filename.
  return createSupportUploadTicket(auth.threadId, extension.slice(0, 16));
}

/* ------------------------------------------------------------------ */
/* Post a message (guest / student / admin)                             */
/* ------------------------------------------------------------------ */

/**
 * One implementation behind the four composer actions. The audience is decided
 * server-side from the request, never from a caller-supplied role: a request
 * carrying a `guestToken` is a guest and must pass the capability check, and a
 * request without one needs a session. There is no third path, so a student
 * cannot post into a guest thread without holding that thread's token.
 */
async function postSupportMessage(
  _state: ActionState,
  formData: FormData,
  kind: SupportKind
): Promise<ActionState> {
  const guestToken = String(formData.get("guestToken") ?? "");

  if (guestToken) {
    return postAsGuest(formData, kind, guestToken);
  }
  return postAsUser(formData, kind);
}

function validateSupportPayload(formData: FormData, kind: SupportKind) {
  return messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    kind,
    body: formData.get("body") ?? "",
    storagePath: formData.get("storagePath") ?? undefined,
    fileName: formData.get("fileName") ?? undefined,
    mimeType: formData.get("mimeType") ?? undefined,
    fileSize: formData.get("fileSize") ?? undefined,
    durationSeconds: formData.get("durationSeconds") ?? undefined,
    replyToMessageId: formData.get("replyToMessageId") || null
  });
}

async function postAsGuest(
  formData: FormData,
  kind: SupportKind,
  guestToken: string
): Promise<ActionState> {
  const limit = await guestLimit(20, 60 * 60 * 1000);
  if (!limit.allowed) return fail("بعتّ رسايل كثيرة في وقت قصير. استنى شوية وجرّب تاني.");

  const parsed = validateSupportPayload(formData, kind);
  if (!parsed.success) return fail("الرسالة غير صالحة.");
  if (kind === "text" && !parsed.data.body) return fail("اكتب رسالة أولًا.");

  const auth = await authenticateGuest(parsed.data.conversationId, guestToken);
  if (!auth) return fail("انتهت صلاحية المحادثة.");

  // The client reports the path it uploaded to. Without this check a guest could
  // attach an object belonging to a different thread.
  if (kind !== "text" && !isSupportMediaPathForThread(parsed.data.storagePath, auth.threadId)) {
    return fail("الملف غير صالح.");
  }

  const replyError = await validateGuestReplyTarget(auth.threadId, parsed.data.replyToMessageId);
  if (replyError) return fail(replyError);

  const admin = createSupabaseAdminClient();
  const { data: thread } = await admin
    .from("support_threads")
    .select("guest_name")
    .eq("id", auth.threadId)
    .maybeSingle();

  const { error } = await admin.from("support_messages").insert({
    thread_id: auth.threadId,
    author_profile_id: null,
    author_kind: "guest",
    guest_name: thread?.guest_name ?? null,
    kind,
    body: kind === "text" ? parsed.data.body : "",
    storage_path: kind === "text" ? null : parsed.data.storagePath,
    file_name: kind === "text" ? null : parsed.data.fileName,
    mime_type: kind === "text" ? null : parsed.data.mimeType,
    file_size: kind === "text" ? null : parsed.data.fileSize,
    duration_seconds: kind === "voice" ? parsed.data.durationSeconds : null,
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return fail("تعذر إرسال الرسالة.");

  // The guest's own message should not read as unread to them.
  await markGuestRead(auth.threadId, auth.tokenHash);
  revalidatePath("/admin/support");
  return ok;
}

async function validateGuestReplyTarget(threadId: string, replyTo: string | null | undefined) {
  if (!replyTo) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("support_messages")
    .select("id")
    .eq("id", replyTo)
    .eq("thread_id", threadId)
    .maybeSingle();
  return data ? null : "الرسالة التي تريد الرد عليها غير متاحة.";
}

async function markGuestRead(threadId: string, tokenHash: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("support_thread_reads")
    .upsert(
      { thread_id: threadId, reader_key: tokenHash, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,reader_key" }
    );
}

async function postAsUser(formData: FormData, kind: SupportKind): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return fail("غير مصرح.");

  const parsed = validateSupportPayload(formData, kind);
  if (!parsed.success) return fail("الرسالة غير صالحة.");
  if (kind === "text" && !parsed.data.body) return fail("اكتب رسالة أولًا.");

  const supabase = await createSupabaseServerClient();
  const { data: thread } = await supabase
    .from("support_threads")
    .select("id, profile_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();

  if (!thread) return fail("المحادثة غير متاحة.");

  // A guest thread has no authenticated participant, so a session alone must not
  // be enough to post into it. Admins are the exception by design.
  if (thread.profile_id !== profile.id && profile.role !== "admin") {
    return fail("المحادثة غير متاحة.");
  }

  // Same containment check the guest path performs: an uploaded object must
  // live inside this thread's own prefix.
  if (kind !== "text" && !isSupportMediaPathForThread(parsed.data.storagePath, parsed.data.conversationId)) {
    return fail("الملف غير صالح.");
  }

  const { error } = await supabase.from("support_messages").insert({
    thread_id: parsed.data.conversationId,
    author_profile_id: profile.id,
    author_kind: profile.role === "admin" ? "admin" : "student",
    guest_name: null,
    kind,
    body: kind === "text" ? parsed.data.body : "",
    storage_path: kind === "text" ? null : parsed.data.storagePath,
    file_name: kind === "text" ? null : parsed.data.fileName,
    mime_type: kind === "text" ? null : parsed.data.mimeType,
    file_size: kind === "text" ? null : parsed.data.fileSize,
    duration_seconds: kind === "voice" ? parsed.data.durationSeconds : null,
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return fail("تعذر إرسال الرسالة.");

  await markSupportThreadReadForProfile(profile, parsed.data.conversationId);
  revalidatePath("/admin/support");
  revalidatePath("/student/support");
  return ok;
}

export async function sendSupportTextMessageAction(state: ActionState, formData: FormData) {
  return postSupportMessage(state, formData, "text");
}
export async function sendSupportVoiceMessageAction(state: ActionState, formData: FormData) {
  return postSupportMessage(state, formData, "voice");
}
export async function sendSupportImageMessageAction(state: ActionState, formData: FormData) {
  return postSupportMessage(state, formData, "image");
}
export async function sendSupportVideoMessageAction(state: ActionState, formData: FormData) {
  return postSupportMessage(state, formData, "video");
}

/* ------------------------------------------------------------------ */
/* Guest: polling for new messages                                     */
/* ------------------------------------------------------------------ */

/**
 * Polling endpoint for the guest view. Realtime requires a session, so guests
 * fetch deltas instead. Returns only rows newer than `since`, already mapped to
 * the shared thread shape and signed, so the client can merge and render without
 * a second round trip.
 */
export async function fetchGuestSupportMessages(
  threadId: string,
  token: string,
  since: string
): Promise<{ messages: import("@/components/conversation-thread").ThreadMessage[]; signed: Record<string, string | null> } | null> {
  const parsed = supportGuestTokenSchema.safeParse({ threadId, token });
  if (!parsed.success) return null;

  const auth = await authenticateGuest(parsed.data.threadId, parsed.data.token);
  if (!auth) return null;

  // A client that has been away a long time still needs the whole thread, and
  // `since` is client-supplied so it cannot be trusted as a lower bound.
  const sinceMs = Date.parse(since);
  const tooOld = !Number.isFinite(sinceMs) || Date.now() - sinceMs >= 60 * 60 * 1000;
  const floor = tooOld ? new Date(Date.now() - 60 * 60 * 1000).toISOString() : since;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("support_messages")
    .select(SUPPORT_MESSAGE_COLUMNS)
    .eq("thread_id", auth.threadId)
    .gt("created_at", floor)
    .order("created_at")
    .limit(200);

  if (error) return null;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const messages = rows.map((r) => toThreadMessage(r, auth.tokenHash, `guest:${auth.tokenHash}`));

  const paths = rows.map((r) => (typeof r.storage_path === "string" ? r.storage_path : null));
  const byPath = await signSupportMedia(paths);

  const signed: Record<string, string | null> = {};
  rows.forEach((r, i) => {
    if (messages[i]?.storage_path) signed[messages[i].id] = byPath[messages[i].storage_path as string] ?? null;
  });

  await markGuestRead(auth.threadId, auth.tokenHash);
  return { messages, signed };
}

/* ------------------------------------------------------------------ */
/* Student: ensure their single thread exists                          */
/* ------------------------------------------------------------------ */

export type StartStudentThreadResult = ActionState & { threadId?: string };

/**
 * Students get one ongoing conversation, not a list. This is the
 * create-or-return half of that: the partial unique index on `profile_id` is the
 * real guarantee, so a double-tap produces one thread, not two.
 */
export async function startStudentThreadAction(): Promise<StartStudentThreadResult> {
  const profile = await getCurrentProfile();
  if (!profile) return fail("غير مصرح.");
  if (profile.role !== "student") return fail("غير مصرح.");

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("support_threads")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existing) return { ...ok, threadId: existing.id };

  const { data, error } = await supabase
    .from("support_threads")
    .insert({
      profile_id: profile.id,
      guest_name: profile.full_name,
      guest_code: profile.code
    })
    .select("id")
    .single();

  // 23505 = unique violation, i.e. a concurrent request won the race.
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("support_threads")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (raced) return { ...ok, threadId: raced.id };
    }
    return fail("تعذر بدء المحادثة. جرّب تاني.");
  }

  return { ...ok, threadId: data.id };
}

/* ------------------------------------------------------------------ */
/* Read marker                                                          */
/* ------------------------------------------------------------------ */

export async function markSupportThreadReadAction(threadId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return;
  const supabase = await createSupabaseServerClient();

  const { data: thread } = await supabase
    .from("support_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return;

  await supabase
    .from("support_thread_reads")
    .upsert(
      { thread_id: threadId, reader_key: readerKeyForProfile(profile), last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,reader_key" }
    );
}

/* ------------------------------------------------------------------ */
/* Admin: clear a thread's messages (keeps the thread)                 */
/* ------------------------------------------------------------------ */

/**
 * Empties a conversation without destroying it. Distinct from delete: the thread
 * row, its read-markers and its place in the inbox all survive, so a guest or
 * student who still has the link sees an empty chat rather than "expired".
 */
export async function clearSupportThreadAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "admin") return fail("غير مصرح.");

    const threadId = String(formData.get("threadId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) return fail("طلب غير صالح.");

    const admin = createSupabaseAdminClient();

    // Pull the object keys before the rows go, for the same reason delete does.
    const { data: media } = await admin
      .from("support_messages")
      .select("storage_path")
      .eq("thread_id", threadId)
      .not("storage_path", "is", null);
    const paths = (media ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));
    await removeSupportMedia(paths);

    // Read-markers point at a message timeline that no longer exists; clearing
    // them stops the thread showing a stale unread count.
    await admin.from("support_thread_reads").delete().eq("thread_id", threadId);

    const { error } = await admin.from("support_messages").delete().eq("thread_id", threadId);
    if (error) {
      console.error("[support] clear thread failed:", error);
      return fail("تعذر مسح المحادثة.");
    }

    // Bump last_message_at so a cleared thread sorts to the top of the inbox
    // instead of sinking to the bottom by age.
    await admin
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${threadId}`);
    return ok;
  } catch (error) {
    console.error("[support] clear thread threw:", error);
    return fail("تعذر مسح المحادثة. حاول تاني.");
  }
}

/* ------------------------------------------------------------------ */
/* Admin: bulk delete selected threads                                 */
/* ------------------------------------------------------------------ */

/**
 * Deletes several conversations at once. The ids arrive as a repeated field so a
 * single FormData can carry the whole selection.
 */
export async function deleteSupportThreadsBulkAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState & { deleted?: number }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "admin") return fail("غير مصرح.");

    const ids = formData
      .getAll("threadId")
      .map((v) => String(v))
      .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    if (!ids.length) return fail("مفيش محادثات محددة.");

    const admin = createSupabaseAdminClient();

    const { data: media } = await admin
      .from("support_messages")
      .select("storage_path")
      .in("thread_id", ids)
      .not("storage_path", "is", null);
    const paths = (media ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));
    await removeSupportMedia(paths);

    const { error } = await admin.from("support_threads").delete().in("id", ids);
    if (error) {
      console.error("[support] bulk delete failed:", error);
      return fail("تعذر حذف المحادثات.");
    }

    revalidatePath("/admin/support");
    return { ...ok, deleted: ids.length };
  } catch (error) {
    console.error("[support] bulk delete threw:", error);
    return fail("تعذر حذف المحادثات. حاول تاني.");
  }
}

/* ------------------------------------------------------------------ */
/* Admin: delete a thread                                               */
/* ------------------------------------------------------------------ */

export async function deleteSupportThreadAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Every failure below has to reach the admin as a message. An uncaught throw
  // used to leave the dialog spinning on "جارِ الحذف..." forever with no feedback,
  // which is indistinguishable from the button doing nothing.
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "admin") return fail("غير مصرح.");

    const threadId = String(formData.get("threadId") ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(threadId)) return fail("طلب غير صالح.");

    const admin = createSupabaseAdminClient();

    const { data: media } = await admin
      .from("support_messages")
      .select("storage_path")
      .eq("thread_id", threadId)
      .not("storage_path", "is", null);

    const paths = (media ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));

    // Objects first: once the rows go the paths are unrecoverable, and orphaned
    // objects in a private bucket are invisible to every code path that cleans up.
    await removeSupportMedia(paths);

    // Messages and read-markers go with it via ON DELETE CASCADE, so a single
    // delete is the whole operation.
    const { error } = await admin.from("support_threads").delete().eq("id", threadId);
    if (error) {
      console.error("[support] delete thread failed:", error);
      return fail("تعذر حذف المحادثة.");
    }

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${threadId}`);
    return ok;
  } catch (error) {
    console.error("[support] delete thread threw:", error);
    return fail("تعذر حذف المحادثة. حاول تاني.");
  }
}
