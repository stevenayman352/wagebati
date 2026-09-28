import type { ThreadMessage } from "@/components/conversation-thread";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signSupportMedia } from "@/lib/support/media";
import { supportTokensMatch, hashSupportToken } from "@/lib/support/token";
import { readerKeyForProfile } from "@/lib/support/reader";
import {
  toThreadMessage,
  str,
  escapeLikePattern,
  SUPPORT_MESSAGE_COLUMNS,
  type LooseRow,
  type SupportMessageRow,
  type SupportThreadRow
} from "@/lib/support/message";
import type { Profile } from "@/lib/types";

// Re-exported so server callers have a single support entry point, while client
// components import the pure projection from "@/lib/support/message" directly.
export { SUPPORT_MESSAGE_COLUMNS, toThreadMessage, supportRowToThreadMessage } from "@/lib/support/message";
export type { SupportMessageRow, SupportThreadRow, LooseRow } from "@/lib/support/message";

export type SupportThreadView = {
  id: string;
  /** Display name of whoever opened the thread. */
  requesterName: string;
  /** Free-text code supplied pre-login; never validated against `profiles`. */
  requesterCode: string;
  isGuest: boolean;
  lastMessageAt: string;
  createdAt: string;
};

function toThreadView(t: SupportThreadRow): SupportThreadView {
  return {
    id: t.id,
    requesterName: t.guest_name,
    requesterCode: t.guest_code,
    isGuest: t.profile_id === null,
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at
  };
}

export type SupportThreadPayload = {
  thread: SupportThreadView;
  messages: ThreadMessage[];
  signed: Record<string, string | null>;
};

async function buildPayload(
  thread: SupportThreadRow,
  rows: LooseRow[],
  mineId: string,
  guestId?: string
): Promise<SupportThreadPayload> {
  const messages = rows.map((r) => toThreadMessage(r, mineId, guestId));
  const pathsById = new Map<string, string>();
  for (const row of rows) {
    const p = str(row.storage_path);
    if (p) pathsById.set(String(row.id ?? ""), p);
  }
  const signedByPath = await signSupportMedia([...pathsById.values()]);

  const signed: Record<string, string | null> = {};
  for (const [id, path] of pathsById) signed[id] = signedByPath[path] ?? null;

  return { thread: toThreadView(thread), messages, signed };
}

/* ------------------------------------------------------------------ */
/* Authenticated access (RLS applies)                                   */
/* ------------------------------------------------------------------ */

export async function loadStudentSupportThread(profile: Profile): Promise<SupportThreadPayload | null> {
  const supabase = await createSupabaseServerClient();

  const { data: thread } = await supabase
    .from("support_threads")
    .select("id, profile_id, guest_name, guest_code, last_message_at, created_at")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!thread) return null;
  return loadSupportThreadForProfile(thread as SupportThreadRow, profile.id);
}

export async function loadSupportThreadForProfile(
  thread: SupportThreadRow,
  profileId: string
): Promise<SupportThreadPayload> {
  const supabase = await createSupabaseServerClient();

  const { data: rows } = await supabase
    .from("support_messages")
    .select(SUPPORT_MESSAGE_COLUMNS)
    .eq("thread_id", thread.id)
    .order("created_at")
    .limit(1000);

  return buildPayload(thread, (rows ?? []) as unknown as SupportMessageRow[], profileId);
}

export type SupportInboxRow = SupportThreadView & {
  lastMessage: string;
  unread: number;
};

/**
 * Admin inbox. One row per thread ordered by recency, with a short preview and
 * the unread count joined in.
 */
/**
 * Escapes the wildcards PostgREST's `like`/`ilike` would otherwise interpret, so
 * a search for "50%" or "a_b" matches that literal text. The trailing backslash
 * is the escape character, so it has to be doubled as well.
 */
export async function loadSupportInbox(
  unread: Record<string, number>,
  query?: string
): Promise<SupportInboxRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("support_threads")
    .select("id, profile_id, guest_name, guest_code, last_message_at, created_at")
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) return [];

  const threads = data as unknown as SupportThreadRow[];
  const ids = threads.map((t) => t.id);

  const { data: lastRows } = await supabase
    .from("support_messages")
    .select("thread_id, kind, body, created_at")
    .in("thread_id", ids)
    .order("created_at", { ascending: false });

  const latestByThread = new Map<string, { kind: string; body: string }>();
  for (const row of (lastRows ?? []) as { thread_id: string; kind: string; body: string }[]) {
    if (!latestByThread.has(row.thread_id)) latestByThread.set(row.thread_id, { kind: row.kind, body: row.body });
  }

  // A search matches a thread on its requester's name or code, or on the text of
  // any message in it — so the body match is resolved to thread ids first and then
  // unioned with the name/code matches.
  const needle = query?.trim() ?? "";
  let visible = threads;
  if (needle) {
    const pattern = `%${escapeLikePattern(needle)}%`;
    const lower = needle.toLowerCase();

    const byNameOrCode = new Set(
      threads
        .filter(
          (t) =>
            t.guest_name.toLowerCase().includes(lower) ||
            t.guest_code.toLowerCase().includes(lower)
        )
        .map((t) => t.id)
    );

    const { data: messageHits } = await supabase
      .from("support_messages")
      .select("thread_id")
      .in("thread_id", ids)
      .ilike("body", pattern);

    for (const row of (messageHits ?? []) as { thread_id: string }[]) {
      byNameOrCode.add(row.thread_id);
    }

    visible = threads.filter((t) => byNameOrCode.has(t.id));
  }

  return visible.map((t) => ({
    ...toThreadView(t),
    lastMessage: previewFor(latestByThread.get(t.id)),
    unread: unread[t.id] ?? 0
  }));
}

function previewFor(msg: { kind: string; body: string } | undefined): string {
  if (!msg) return "";
  if (msg.kind === "voice") return "تسجيل صوتي";
  if (msg.kind === "image") return "صورة";
  if (msg.kind === "video") return "فيديو";
  return msg.body;
}

/* ------------------------------------------------------------------ */
/* Guest access (service role, capability token already verified)     */
/* ------------------------------------------------------------------ */

export type GuestAuth = {
  threadId: string;
  token: string;
  tokenHash: string;
  /** Carried on the row the token check already read, to save a round trip on send. */
  guestName: string | null;
};

/**
 * Resolves a `?k=` capability token to its thread, or null when the token does
 * not belong to that thread. This is the only authorization a guest gets, so it
 * is constant-time on the stored digest.
 */
export async function authenticateGuest(
  threadId: string,
  token: string | null
): Promise<GuestAuth | null> {
  if (!token || !threadId) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("support_threads")
    .select("id, guest_token_hash, guest_name")
    .eq("id", threadId)
    .is("profile_id", null)
    .maybeSingle();

  if (!data?.guest_token_hash) return null;

  const tokenHash = hashSupportToken(token);
  if (!supportTokensMatch(data.guest_token_hash as string, tokenHash)) return null;

  // `guestName` rides along on the row the token check already fetched. The send
  // path needs it to stamp the message, and reading it again cost a round trip
  // on every single message.
  return { threadId, token, tokenHash, guestName: (data.guest_name as string | null) ?? null };
}

export async function loadGuestThread(auth: GuestAuth): Promise<SupportThreadPayload | null> {
  const admin = createSupabaseAdminClient();

  const { data: thread } = await admin
    .from("support_threads")
    .select("id, profile_id, guest_name, guest_code, last_message_at, created_at")
    .eq("id", auth.threadId)
    .maybeSingle();

  if (!thread) return null;

  const { data: rows } = await admin
    .from("support_messages")
    .select(SUPPORT_MESSAGE_COLUMNS)
    .eq("thread_id", auth.threadId)
    .order("created_at")
    .limit(1000);

  // guestId makes every null-author row resolve to this guest, so the shared
  // component's `sender_id === mineId` check puts their messages on the right.
  return buildPayload(thread as SupportThreadRow, (rows ?? []) as unknown as SupportMessageRow[], auth.tokenHash, `guest:${auth.tokenHash}`);
}

/* ------------------------------------------------------------------ */
/* Read markers                                                        */
/* ------------------------------------------------------------------ */

export async function markSupportThreadReadForProfile(profile: Profile, threadId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const readerKey = readerKeyForProfile(profile);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("support_thread_reads")
    .upsert(
      { thread_id: threadId, reader_key: readerKey, last_read_at: now },
      { onConflict: "thread_id,reader_key" }
    );

  if (error) console.error("[support] mark read failed:", error.message);
}

export async function markSupportThreadReadForGuest(threadId: string, tokenHash: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("support_thread_reads")
    .upsert(
      { thread_id: threadId, reader_key: tokenHash, last_read_at: now },
      { onConflict: "thread_id,reader_key" }
    );

  if (error) console.error("[support] guest mark read failed:", error.message);
}
