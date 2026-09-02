"use client";

import { useActionState, useRef, useState } from "react";
import { submitSubmissionAction } from "@/app/actions/student";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWithProgress, type UploadHandle } from "@/lib/upload";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { maxBytesFor, allowedMimeFor } from "@/lib/file-rules";
import type { ActionState } from "@/lib/types";

const MAX_VIDEO = maxBytesFor("video");
const MAX_VOICE = maxBytesFor("voice");
const MAX_IMAGE = maxBytesFor("image");
const ALLOWED_VIDEO = allowedMimeFor("video").split(",");
const ALLOWED_VOICE = allowedMimeFor("voice").split(",");
const ALLOWED_IMAGE = allowedMimeFor("image").split(",");

const init: ActionState = { ok: false, message: "" };

type UploadProgress = { label: string; pct: number; handle: UploadHandle };

export function SubmissionUploader({ conversationId, nextAttempt }: { conversationId: string; nextAttempt: number }) {
  const [state, formAction, pending] = useActionState(submitSubmissionAction, init);
  const [mode, setMode] = useState<"video" | "voice">("video");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File, prefix: string, label: string) {
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `submissions/${conversationId}/${prefix}/${crypto.randomUUID()}.${ext}`;
    const handle = uploadWithProgress(file, path, {
      bucket: "submissions",
      onProgress: (pct) => setProgress((p) => (p ? { ...p, pct } : p))
    });
    setProgress({ label, pct: 0, handle });
    try {
      await handle.done;
    } finally {
      setProgress(null);
    }
    return path;
  }

  function cancelUpload() {
    progress?.handle.cancel();
    setProgress(null);
  }

  async function handleSubmit() {
    setLocalError(null);
    if (!mainFile) {
      setLocalError("اختر ملف الحل أولًا.");
      return;
    }
    const limits = mode === "video" ? { allow: ALLOWED_VIDEO, max: MAX_VIDEO } : { allow: ALLOWED_VOICE, max: MAX_VOICE };
    if (!limits.allow.includes(mainFile.type)) {
      setLocalError(mode === "video" ? "الفيديو يجب أن يكون MP4 أو MOV." : "التسجيل الصوتي يجب أن يكون MP3.");
      return;
    }
    if (mainFile.size > limits.max) {
      setLocalError(mode === "video" ? "حجم الفيديو أكبر من 250MB." : "حجم التسجيل أكبر من 10MB.");
      return;
    }
    const badImage = imageFiles.find((f) => !ALLOWED_IMAGE.includes(f.type) || f.size > MAX_IMAGE);
    if (badImage) {
      setLocalError("صورة غير صالحة: JPG/PNG/WebP حتى 10MB.");
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: rpcAttempt } = await supabase.rpc("next_attempt_number", {
        target_conversation: conversationId
      });
      const attempt = typeof rpcAttempt === "number" ? rpcAttempt : nextAttempt;

      const mainPath = await uploadOne(mainFile, `${attempt}`, mode === "video" ? "جار رفع الفيديو..." : "جار رفع التسجيل...");

      const images: { path: string; name: string; mime: string; size: number }[] = [];
      for (const img of imageFiles) {
        const p = await uploadOne(img, `${attempt}/images`, "جار رفع الصور...");
        images.push({ path: p, name: img.name, mime: img.type, size: img.size });
      }

      const form = formRef.current;
      const set = (name: string, value: string) => {
        (form!.elements.namedItem(name) as HTMLInputElement).value = value;
      };
      set("attempt", String(attempt));
      set(mode === "video" ? "videoPath" : "voicePath", mainPath);
      set(mode === "video" ? "videoName" : "voiceName", mainFile.name);
      set(mode === "video" ? "videoMime" : "voiceMime", mainFile.type);
      set(mode === "video" ? "videoSize" : "voiceSize", String(mainFile.size));
      set("imagesJson", JSON.stringify(images));
      formRef.current!.requestSubmit();
    } catch (e) {
      setProgress(null);
      setLocalError(e instanceof Error ? e.message : "فشل رفع الملفات.");
    }
  }

  async function handleMainPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (file) setMainFile(file);
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="attempt" />
      <input type="hidden" name="videoPath" />
      <input type="hidden" name="videoName" />
      <input type="hidden" name="videoMime" />
      <input type="hidden" name="videoSize" />
      <input type="hidden" name="voicePath" />
      <input type="hidden" name="voiceName" />
      <input type="hidden" name="voiceMime" />
      <input type="hidden" name="voiceSize" />
      <input type="hidden" name="imagesJson" />
      <div className="flex gap-2">
        <Button type="button" variant={mode === "video" ? "default" : "outline"} size="sm" onClick={() => { setMode("video"); setMainFile(null); }}>
          فيديو الحل
        </Button>
        <Button type="button" variant={mode === "voice" ? "default" : "outline"} size="sm" onClick={() => { setMode("voice"); setMainFile(null); }}>
          تسجيل صوتي
        </Button>
      </div>

      {mode === "voice" ? (
        <div className="grid gap-2">
          <Label>سجّل صوتك (حتى 10 دقائق)</Label>
          <VoiceRecorder onRecorded={(file) => setMainFile(file)} disabled={progress !== null} uploading={progress !== null} />
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="main-file">ملف الفيديو (MP4/MOV حتى 250MB)</Label>
          <input
            id="main-file"
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            className="block w-full cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm file:me-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:font-medium file:text-primary"
            onChange={(e) => void handleMainPick(e)}
          />
        </div>
      )}
      {mainFile ? <p className="text-sm text-muted-foreground">{mainFile.name}</p> : null}

      <div className="grid gap-2">
        <Label htmlFor="image-files">صور توضيحية (اختياري، حتى 10 صور)</Label>
        <input
          id="image-files"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="block w-full cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm file:me-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:font-medium file:text-primary"
          onChange={(e) => setImageFiles(Array.from(e.target.files ?? []).slice(0, 10))}
        />
      </div>

      {progress ? (
        <div dir="ltr" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Progress value={progress.pct} className="h-1.5 flex-1" />
          <span className="min-w-9 text-right text-xs tabular-nums text-muted-foreground">{progress.pct}%</span>
          <Button type="button" variant="ghost" size="sm" onClick={cancelUpload}>
            إلغاء
          </Button>
        </div>
      ) : null}

      <Button type="button" disabled={pending || progress !== null || !mainFile} onClick={() => void handleSubmit()}>
        {progress ? "جار الرفع..." : pending ? "جار الإرسال..." : `إرسال الحل (محاولة ${nextAttempt})`}
      </Button>

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
      {state.message ? (
        <p className={`text-sm ${state.ok ? "text-primary" : "text-destructive"}`}>{state.message}</p>
      ) : null}
    </form>
  );
}