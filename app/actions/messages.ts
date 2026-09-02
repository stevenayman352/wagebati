"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messageSchema, uuidFormSchema } from "@/lib/validators";
import type { ActionState } from "@/lib/types";

type AccessContext =
  | { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; error: string };

async function conversationAccess(conversationId: string): Promise<AccessContext> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "غير مصرح." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return { ok: false, error: "المحادثة غير متاحة." };
  return { ok: true, profile, supabase };
}

async function validateReplyTarget(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  conversationId: string,
  replyToMessageId: string | null | undefined
): Promise<string | null> {
  if (!replyToMessageId) return null;
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("id", replyToMessageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!data) return "الرسالة التي تريد الرد عليها غير متاحة.";
  return null;
}

export async function sendTextMessageAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    kind: "text",
    body: formData.get("body"),
    replyToMessageId: formData.get("replyToMessageId") || null
  });
  if (!parsed.success || parsed.data.body.trim() === "") {
    return { ok: false, message: "اكتب رسالة أولًا." };
  }

  const ctx = await conversationAccess(parsed.data.conversationId);
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const replyError = await validateReplyTarget(ctx.supabase, parsed.data.conversationId, parsed.data.replyToMessageId);
  if (replyError) return { ok: false, message: replyError };

  const { error } = await ctx.supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: ctx.profile.id,
    sender_role: ctx.profile.role,
    kind: "text",
    body: parsed.data.body.trim(),
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return { ok: false, message: error.message.includes("can_post_message") ? "المحادثة مغلقة." : error.message };
  return { ok: true, message: "" };
}

export async function sendImageMessageAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    kind: "image",
    body: "",
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    fileSize: formData.get("fileSize"),
    replyToMessageId: formData.get("replyToMessageId") || null
  });
  if (!parsed.success) return { ok: false, message: "صورة غير صالحة (JPG/PNG/WebP حتى 10MB)." };
  if (parsed.data.kind !== "image") return { ok: false, message: "نوع رسالة غير صالح." };

  const ctx = await conversationAccess(parsed.data.conversationId);
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const replyError = await validateReplyTarget(ctx.supabase, parsed.data.conversationId, parsed.data.replyToMessageId);
  if (replyError) return { ok: false, message: replyError };

  const { error } = await ctx.supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: ctx.profile.id,
    sender_role: ctx.profile.role,
    kind: "image",
    body: "",
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType,
    file_size: parsed.data.fileSize,
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return { ok: false, message: error.message.includes("can_post_message") ? "المحادثة مغلقة." : error.message };
  revalidatePath("/teacher");
  return { ok: true, message: "" };
}

export async function sendVideoMessageAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    kind: "video",
    body: "",
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    fileSize: formData.get("fileSize"),
    replyToMessageId: formData.get("replyToMessageId") || null
  });
  if (!parsed.success || parsed.data.kind !== "video") return { ok: false, message: "فيديو غير صالح." };
  if (parsed.data.mimeType !== "video/mp4" && parsed.data.mimeType !== "video/quicktime") {
    return { ok: false, message: "الفيديو يجب أن يكون MP4 أو MOV." };
  }
  if ((parsed.data.fileSize ?? 0) > 262144000) return { ok: false, message: "الفيديو أكبر من 250MB." };

  const ctx = await conversationAccess(parsed.data.conversationId);
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const replyError = await validateReplyTarget(ctx.supabase, parsed.data.conversationId, parsed.data.replyToMessageId);
  if (replyError) return { ok: false, message: replyError };

  const { error } = await ctx.supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: ctx.profile.id,
    sender_role: ctx.profile.role,
    kind: "video",
    body: "",
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType,
    file_size: parsed.data.fileSize,
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return { ok: false, message: error.message.includes("can_post_message") ? "المحادثة مغلقة." : error.message };
  revalidatePath("/teacher");
  return { ok: true, message: "" };
}

export async function sendVoiceMessageAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    kind: "voice",
    body: "",
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    fileSize: formData.get("fileSize"),
    durationSeconds: formData.get("durationSeconds"),
    replyToMessageId: formData.get("replyToMessageId") || null
  });
  if (!parsed.success || parsed.data.kind !== "voice") return { ok: false, message: "تسجيل صوتي غير صالح." };
  if (parsed.data.mimeType !== "audio/mpeg") return { ok: false, message: "التسجيل يجب أن يكون MP3." };
  if ((parsed.data.fileSize ?? 0) > 10485760) return { ok: false, message: "التسجيل أكبر من 10MB." };

  const ctx = await conversationAccess(parsed.data.conversationId);
  if (!ctx.ok) return { ok: false, message: ctx.error };
  const replyError = await validateReplyTarget(ctx.supabase, parsed.data.conversationId, parsed.data.replyToMessageId);
  if (replyError) return { ok: false, message: replyError };

  const { error } = await ctx.supabase.from("messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: ctx.profile.id,
    sender_role: ctx.profile.role,
    kind: "voice",
    body: "",
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType,
    file_size: parsed.data.fileSize,
    duration_seconds: parsed.data.durationSeconds,
    reply_to_message_id: parsed.data.replyToMessageId ?? null
  });

  if (error) return { ok: false, message: error.message.includes("can_post_message") ? "المحادثة مغلقة." : error.message };
  revalidatePath("/teacher");
  return { ok: true, message: "" };
}

export async function markConversationReadAction(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) return;
  const parsed = uuidFormSchema.safeParse({ id: formData.get("conversationId") });
  if (!parsed.success) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("conversation_reads")
    .upsert(
      { conversation_id: parsed.data.id, user_id: profile.id, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" }
    );
  revalidatePath("/teacher");
}