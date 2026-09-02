"use client";

import { useActionState, useRef, useState } from "react";
import { addAttachmentAction } from "@/app/actions/teacher";
import { uploadWithProgress, type UploadHandle } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { maxBytesFor, allowedMimeFor } from "@/lib/file-rules";
import type { ActionState } from "@/lib/types";

const MAX_IMAGE_BYTES = maxBytesFor("image");
const ALLOWED = allowedMimeFor("image").split(",");

const init: ActionState = { ok: false, message: "" };

export function AttachmentUploader({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState(addAttachmentAction, init);
  const formRef = useRef<HTMLFormElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const mimeRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pct: number; handle: UploadHandle } | null>(null);

  async function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("نوع الملف غير مسموح (JPG/PNG/WebP فقط).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("حجم الصورة أكبر من 10MB.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `assignment-attachments/${assignmentId}/${crypto.randomUUID()}.${ext}`;

    const handle = uploadWithProgress(file, path, {
      bucket: "assignment-attachments",
      onProgress: (pct) => setProgress((p) => (p ? { ...p, pct } : p))
    });
    setProgress({ pct: 0, handle });
    try {
      await handle.done;
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "فشل رفع الصورة.");
      return;
    }
    setProgress(null);

    pathRef.current!.value = path;
    nameRef.current!.value = file.name;
    mimeRef.current!.value = file.type;
    sizeRef.current!.value = String(file.size);
    formRef.current!.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input ref={pathRef} type="hidden" name="storagePath" />
      <input ref={nameRef} type="hidden" name="fileName" />
      <input ref={mimeRef} type="hidden" name="mimeType" />
      <input ref={sizeRef} type="hidden" name="fileSize" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending || progress !== null} onClick={() => fileInputRef.current?.click()}>
          {pending || progress !== null ? "جار الرفع..." : "إرفاق صورة"}
        </Button>
      </div>
      {progress ? (
        <div dir="ltr" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Progress value={progress.pct} className="h-1.5 flex-1" />
          <span className="min-w-9 text-right text-xs tabular-nums text-muted-foreground">{progress.pct}%</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { progress.handle.cancel(); setProgress(null); }}>
            إلغاء
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {state.message ? (
        <p className={`text-sm ${state.ok ? "text-primary" : "text-destructive"}`}>{state.message}</p>
      ) : null}
    </form>
  );
}