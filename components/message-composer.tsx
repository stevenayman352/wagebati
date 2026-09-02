"use client";

import { useActionState, useRef, useState } from "react";
import {
  sendImageMessageAction,
  sendTextMessageAction,
  sendVideoMessageAction,
  sendVoiceMessageAction
} from "@/app/actions/messages";
import { uploadWithProgress, type UploadHandle } from "@/lib/upload";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { maxBytesFor, allowedMimeFor } from "@/lib/file-rules";
import { quotePreview, type ThreadMessage } from "@/components/conversation-thread";
import { Camera, CornerUpLeft, Mic, Paperclip, Send, Video, X } from "lucide-react";
import type { ActionState } from "@/lib/types";

const MAX_VIDEO = maxBytesFor("video");
const MAX_IMAGE = maxBytesFor("image");
const ALLOWED_VIDEO = allowedMimeFor("video").split(",");
const ALLOWED_IMAGE = allowedMimeFor("image").split(",");
const init: ActionState = { ok: false, message: "" };

type StagedMedia = { kind: "video" | "image"; storagePath: string; fileName: string; mimeType: string; fileSize: number };
type PendingUpload = { kind: "video" | "image" | "voice"; name: string; pct: number; handle: UploadHandle };

export function MessageComposer({
  conversationId,
  disabled,
  replyTo,
  onCancelReply
}: {
  conversationId: string;
  disabled: boolean;
  replyTo: ThreadMessage | null;
  onCancelReply: () => void;
}) {
  const [textState, textAction, sending] = useActionState(sendTextMessageAction, init);
  const [voiceState, voiceAction, sendingVoice] = useActionState(sendVoiceMessageAction, init);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [staged, setStaged] = useState<StagedMedia | null>(null);
  const [mediaState, setMediaState] = useState<ActionState>(init);
  const [sendingMedia, setSendingMedia] = useState(false);
  const textFormRef = useRef<HTMLFormElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  async function uploadMedia(file: File, kind: PendingUpload["kind"], duration?: number) {
    setLocalError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `message-media/${conversationId}/${crypto.randomUUID()}.${ext}`;
    const handle = uploadWithProgress(file, path, {
      bucket: "message-media",
      onProgress: (pct) => setPending((p) => (p ? { ...p, pct } : p))
    });
    setPending({ kind, name: file.name, pct: 0, handle });
    try {
      await handle.done;
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "فشل رفع الملف.");
      setPending(null);
      return;
    }
    setPending(null);

    if (kind === "voice") {
      const fd = new FormData();
      fd.set("conversationId", conversationId);
      fd.set("storagePath", path);
      fd.set("fileName", file.name);
      fd.set("mimeType", file.type);
      fd.set("fileSize", String(file.size));
      fd.set("durationSeconds", String(duration ?? 1));
      if (replyTo) fd.set("replyToMessageId", replyTo.id);
      voiceAction(fd);
      onCancelReply();
      return;
    }

    setStaged({ kind, storagePath: path, fileName: file.name, mimeType: file.type, fileSize: file.size });
    setMenuOpen(false);
  }

  async function handleVideoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_VIDEO.includes(file.type)) {
      setLocalError("الفيديو يجب أن يكون MP4 أو MOV.");
      return;
    }
    if (file.size > MAX_VIDEO) {
      setLocalError("حجم الفيديو أكبر من 250MB.");
      return;
    }
    await uploadMedia(file, "video");
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE.includes(file.type) || file.size > MAX_IMAGE) {
      setLocalError("الصورة يجب أن تكون JPG/PNG/WebP حتى 10MB.");
      return;
    }
    await uploadMedia(file, "image");
  }

  async function handleSend() {
    if (staged) {
      setSendingMedia(true);
      setMediaState(init);
      const fd = new FormData();
      fd.set("conversationId", conversationId);
      fd.set("storagePath", staged.storagePath);
      fd.set("fileName", staged.fileName);
      fd.set("mimeType", staged.mimeType);
      fd.set("fileSize", String(staged.fileSize));
      if (replyTo) fd.set("replyToMessageId", replyTo.id);
      const result = staged.kind === "video" ? await sendVideoMessageAction(init, fd) : await sendImageMessageAction(init, fd);
      setSendingMedia(false);
      setMediaState(result);
      if (result.ok) {
        setStaged(null);
        onCancelReply();
        textFormRef.current?.reset();
      }
      return;
    }
    textFormRef.current?.requestSubmit();
  }

  const uploading = pending !== null;
  const anyBusy = uploading || sendingMedia || sendingVoice;

  return (
    <>
      {/* Spacer so the scrollable content clears the fixed composer */}
      <div className="h-44 md:h-32" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 shadow-raise backdrop-blur-xl">
        <div className="mx-auto w-full max-w-5xl px-4 pt-2 md:px-6">
          <div className="grid gap-2 pb-[calc(env(safe-area-inset-bottom)_+_var(--nav-h)_+_0.5rem)]">
    {menuOpen && !uploading ? <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden /> : null}

      {staged ? (
        <div className="flex items-center justify-between gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1.5 animate-slide-up">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            {staged.kind === "video" ? <Video className="size-4 shrink-0 text-primary" /> : <Camera className="size-4 shrink-0 text-primary" />}
            <span className="truncate">{staged.fileName}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{staged.kind === "video" ? "فيديو" : "صورة"}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" className="size-7 shrink-0 rounded-full p-0" onClick={() => setStaged(null)} disabled={anyBusy}>
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {recorderOpen ? (
        <div className="flex items-center justify-between gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5">
          <VoiceRecorder
            onRecorded={(file, dur) => {
              setRecorderOpen(false);
              void uploadMedia(file, "voice", dur);
            }}
            disabled={disabled || uploading}
            uploading={uploading && pending?.kind === "voice"}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => setRecorderOpen(false)} disabled={uploading} className="size-7 rounded-full p-0">
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {replyTo ? (
        <div className="flex items-start justify-between gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-card animate-slide-up">
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-primary">
              <CornerUpLeft className="size-3.5 rtl:-scale-x-100" />
              رد على {replyTo.sender_role === "teacher" ? "المدرس" : "الطالب"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{quotePreview(replyTo)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 rounded-full p-0"
            onClick={onCancelReply}
            disabled={anyBusy}
            aria-label="إلغاء الرد"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1.5 shadow-card transition-shadow focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-primary"
            disabled={disabled || uploading || sendingMedia || sendingVoice}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="إرفاق فيديو أو صورة"
            aria-expanded={menuOpen}
          >
            {uploading && pending?.kind !== "voice" ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Paperclip className="size-[18px]" />
            )}
          </Button>
          {menuOpen && !uploading ? (
            <div className="absolute bottom-11 left-0 z-30 grid gap-1 rounded-2xl border border-border/70 bg-card p-1.5 shadow-xl animate-pop" role="menu" aria-label="إرفاق">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start gap-2 rounded-xl px-3 py-2"
                onClick={() => videoFileRef.current?.click()}
                disabled={disabled || anyBusy}
              >
                <Video className="size-4 text-primary" />
                فيديو
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start gap-2 rounded-xl px-3 py-2"
                onClick={() => imageFileRef.current?.click()}
                disabled={disabled || anyBusy}
              >
                <Camera className="size-4 text-primary" />
                صورة
              </Button>
            </div>
          ) : null}
        </div>
        <form ref={textFormRef} action={textAction} className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={() => onCancelReply()}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="replyToMessageId" value={replyTo?.id ?? ""} />
          <Input
            name="body"
            placeholder="اكتب رسالة..."
            disabled={disabled || sending || sendingVoice || sendingMedia}
            className="h-10 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-primary"
            disabled={disabled || anyBusy}
            onClick={() => setRecorderOpen((v) => !v)}
            aria-label="تسجيل رسالة صوتية"
          >
            <Mic className="size-[18px]" />
          </Button>
          <Button
            type={staged ? "button" : "submit"}
            size="icon"
            className="size-9 shrink-0 rounded-full"
            disabled={disabled || sending || sendingVoice || sendingMedia}
            onClick={staged ? () => void handleSend() : undefined}
            aria-label="إرسال"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <input ref={videoFileRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => void handleVideoPick(e)} disabled={disabled} />
        <input ref={imageFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleImagePick(e)} disabled={disabled} />
      </div>

      {pending ? (
        <div dir="ltr" className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-card">
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block">{pending.name}</span>
          <Progress value={pending.pct} className="h-1.5 flex-1" />
          <span className="min-w-9 text-end text-xs tabular-nums text-muted-foreground">{pending.pct}%</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => pending.handle.cancel()} className="rounded-full">
            إلغاء
          </Button>
        </div>
      ) : null}

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
      {textState.message && !textState.ok ? <p className="text-sm text-destructive">{textState.message}</p> : null}
      {voiceState.message && !voiceState.ok ? <p className="text-sm text-destructive">{voiceState.message}</p> : null}
      {mediaState.message && !mediaState.ok ? <p className="text-sm text-destructive">{mediaState.message}</p> : null}
          </div>
        </div>
      </div>
    </>
  );
}