"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { submissionSchema, submissionImagesSchema } from "@/lib/validators";
import type { ActionState } from "@/lib/types";

type ParsedImages = { path: string; name: string; mime: string; size: number }[];

export async function submitSubmissionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["student"]);
  const parsed = submissionSchema.safeParse({
    conversationId: formData.get("conversationId"),
    attempt: formData.get("attempt"),
    video: formData.get("videoPath")
      ? {
          path: formData.get("videoPath"),
          name: formData.get("videoName"),
          mime: formData.get("videoMime"),
          size: formData.get("videoSize")
        }
      : null,
    voice: formData.get("voicePath")
      ? {
          path: formData.get("voicePath"),
          name: formData.get("voiceName"),
          mime: formData.get("voiceMime"),
          size: formData.get("voiceSize")
        }
      : null,
    imagesJson: formData.get("imagesJson") || "[]"
  });

  if (!parsed.success) return { ok: false, message: "بيانات الحل غير صالحة: فيديو MP4/MOV حتى 250MB أو صوت MP3 حتى 10MB." };
  if (!parsed.data.video && !parsed.data.voice) return { ok: false, message: "يجب إرسال فيديو الحل أو تسجيل صوتي." };

  let images: ParsedImages;
  try {
    const parsedImages = submissionImagesSchema.safeParse(JSON.parse(parsed.data.imagesJson));
    if (!parsedImages.success) return { ok: false, message: "صور غير صالحة (JPG/PNG/WebP حتى 10MB)." };
    images = parsedImages.data;
  } catch {
    return { ok: false, message: "صور غير صالحة." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("assignment_id")
    .eq("id", parsed.data.conversationId)
    .eq("student_id", profile.id)
    .single();
  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const { data: attempt } = await supabase.rpc("next_attempt_number", {
    target_conversation: parsed.data.conversationId
  });
  const serverAttempt = typeof attempt === "number" ? attempt : parsed.data.attempt;
  if (serverAttempt !== parsed.data.attempt) {
    return { ok: false, message: "تُحفظ محاولة أخرى الآن، أعد رفع الحل." };
  }

  const paths = [
    parsed.data.video?.path,
    parsed.data.voice?.path,
    ...images.map((i) => i.path)
  ].filter((p): p is string => Boolean(p));

  const { data: inserted, error: insertError } = await supabase
    .from("submissions")
    .insert({
      conversation_id: parsed.data.conversationId,
      assignment_id: conversation.assignment_id,
      student_id: profile.id,
      attempt_number: parsed.data.attempt,
      video_path: parsed.data.video?.path ?? null,
      video_name: parsed.data.video?.name ?? null,
      video_mime: parsed.data.video?.mime ?? null,
      video_size: parsed.data.video?.size ?? null,
      voice_path: parsed.data.voice?.path ?? null,
      voice_name: parsed.data.voice?.name ?? null,
      voice_mime: parsed.data.voice?.mime ?? null,
      voice_size: parsed.data.voice?.size ?? null
    })
    .select("id")
    .single();

  if (insertError) {
    await cleanOrphans(paths);
    return {
      ok: false,
      message: insertError.message.includes("can_submit")
        ? "لا يمكن الإرسال الآن: الواجب غير منشور أو انتهى وقته أو المحادثة مغلقة."
        : insertError.message
    };
  }

  if (images.length) {
    const { error: imageError } = await supabase.from("submission_images").insert(
      images.map((img, idx) => ({
        submission_id: inserted.id,
        storage_path: img.path,
        file_name: img.name,
        mime_type: img.mime,
        file_size: img.size,
        sort_number: idx
      }))
    );
    if (imageError) {
      const admin = createSupabaseAdminClient();
      await admin.from("submissions").delete().eq("id", inserted.id);
      await cleanOrphans(paths);
      return { ok: false, message: imageError.message };
    }
  }

  revalidatePath("/student");
  revalidatePath(`/student/assignments/${parsed.data.conversationId}`);
  return { ok: true, message: `تم إرسال الحل (محاولة ${parsed.data.attempt}).` };
}

async function cleanOrphans(paths: string[]) {
  if (!paths.length) return;
  try {
    const admin = createSupabaseAdminClient();
    await admin.storage.from("submissions").remove(paths);
  } catch {
    // best effort
  }
}