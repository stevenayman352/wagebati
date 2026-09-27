"use client";

import { useActionState, useMemo, useRef, useState } from "react";
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
import { compressImageFile, compressVideoFile, type CompressProgress } from "@/lib/compress";
import { quotePreview, roleLabel, type ThreadMessage } from "@/components/conversation-thread";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2, CornerUpLeft, Mic, Paperclip, Send, Video, X } from "lucide-react";
import type { ActionState } from "@/lib/types";

const MAX_VIDEO = maxBytesFor("video");
const MAX_IMAGE = maxBytesFor("image");
const ALLOWED_VIDEO = allowedMimeFor("video").split(",");
const ALLOWED_IMAGE = allowedMimeFor("image").split(",");
const init: ActionState = { ok: false, message: "" };

/**
 * The four server actions a composer needs. Defaults to the assignment-chat
 * actions; the support chat passes its own.
 */
export type ComposerActions = {
  text: (state: ActionState, formData: FormData) => Promise<ActionState>;
  voice: (state: ActionState, formData: FormData) => Promise<ActionState>;
  image: (state: ActionState, formData: FormData) => Promise<ActionState>;
  video: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

export const defaultComposerActions: ComposerActions = {
  text: sendTextMessageAction,
  voice: sendVoiceMessageAction,
  image: sendImageMessageAction,
  video: sendVideoMessageAction
};

/**
 * Turns a picked/recorded file into a stored object plus a progress handle.
 *
 * Extracted because the two audiences cannot upload the same way: signed-in
 * users go straight to storage with their session token, while a guest has no
 * session and must first ask the server for a signed upload target.
 */
export type ComposerUploader = (
  file: File,
  ext: string,
  onProgress?: (percent: number) => void
) => Promise<{ path: string; handle: UploadHandle }>;

function makeDefaultUploader(bucket: string, threadId: string): ComposerUploader {
  return async (file, ext, onProgress) => {
    const path = `${bucket}/${threadId}/${crypto.randomUUID()}.${ext}`;
    return { path, handle: uploadWithProgress(file, path, { bucket, onProgress }) };
  };
}

type StagedMedia = { kind: "video" | "image"; storagePath: string; fileName: string; mimeType: string; fileSize: number };
type PendingUpload = {
  kind: "video" | "image" | "voice";
  name: string;
  stage: "compress" | "upload";
  pct: number;
  handle: UploadHandle | null;
};

export function MessageComposer({
  conversationId,
  disabled,
  disabledLabel,
  replyTo,
  onCancelReply,
  fill = false,
  onOptimistic,
  actions = defaultComposerActions,
  bucket = "message-media",
  uploader,
  sendToken
}: {
  /**
   * Opaque id of the conversation. Reused for support threads, where it is a
   * `support_threads.id`; the field name stays `conversationId` so the support
   * actions read the same FormData key and no existing caller churns.
   */
  conversationId: string;
  disabled: boolean;
  disabledLabel?: string;
  replyTo: ThreadMessage | null;
  onCancelReply: () => void;
  fill?: boolean;
  onOptimistic?: (msg: Partial<ThreadMessage> & { body: string; kind: string }) => void;
  actions?: ComposerActions;
  bucket?: string;
  uploader?: ComposerUploader;
  /**
   * Guest capability token. When set, it is attached to every outgoing
   * FormData so the support actions can re-verify the caller, since a guest
   * pollutes no session for RLS to check.
   */
  sendToken?: string;
}) {
  const [textState, textAction, sending] = useActionState(actions.text, init);
  const [voiceState, voiceAction, sendingVoice] = useActionState(actions.voice, init);
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

  // Recreated only when the thread or bucket changes, so the inline defaults
  // below do not become a new function identity on every render.
  const uploaderFn = useMemo(
    () => uploader ?? makeDefaultUploader(bucket, conversationId),
    [uploader, bucket, conversationId]
  );

  async function uploadMedia(file: File, kind: PendingUpload["kind"], duration?: number) {
    setLocalError(null);

    let outFile = file;
    if (kind === "image" || kind === "video") {
      const onC: (p: CompressProgress) => void = (p) =>
        setPending((prev) => (prev && prev.stage === "compress" ? { ...prev, pct: p.pct } : prev));
      if (kind === "image") {
        setPending({ kind, name: file.name, stage: "compress", pct: 0, handle: null });
        outFile = await compressImageFile(file, onC);
      } else {
        setPending({ kind, name: file.name, stage: "compress", pct: 0, handle: null });
        const res = await compressVideoFile(file, onC);
        outFile = res.file;
      }
      if (outFile === file) {
        setPending(null);
      }
    }

    const ext = outFile.name.split(".").pop()?.toLowerCase() ?? "bin";
    const { path, handle } = await uploaderFn(
      outFile,
      ext,
      (pct) => setPending((p) => (p ? { ...p, pct } : p))
    );
    setPending({ kind, name: outFile.name, stage: "upload", pct: 0, handle });
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
      if (sendToken) fd.set("guestToken", sendToken);
      fd.set("storagePath", path);
      fd.set("fileName", outFile.name);
      fd.set("mimeType", outFile.type);
      fd.set("fileSize", String(outFile.size));
      fd.set("durationSeconds", String(duration ?? 1));
      if (replyTo) fd.set("replyToMessageId", replyTo.id);
      onOptimistic?.({
        kind: "voice",
        body: "",
        storage_path: path,
        file_name: outFile.name,
        mime_type: outFile.type,
        file_size: outFile.size,
        duration_seconds: duration ?? 1,
        reply_to_message_id: replyTo?.id ? replyTo.id : null
      });
      voiceAction(fd);
      onCancelReply();
      return;
    }

    setStaged({ kind, storagePath: path, fileName: outFile.name, mimeType: outFile.type, fileSize: outFile.size });
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
      setLocalError("حجم الفيديو كبير جدًا (أكثر من 5GB).");
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
      if (sendToken) fd.set("guestToken", sendToken);
      fd.set("storagePath", staged.storagePath);
      fd.set("fileName", staged.fileName);
      fd.set("mimeType", staged.mimeType);
      fd.set("fileSize", String(staged.fileSize));
      if (replyTo) fd.set("replyToMessageId", replyTo.id);
      const result = staged.kind === "video" ? await actions.video(init, fd) : await actions.image(init, fd);
      setSendingMedia(false);
      setMediaState(result);
      if (result.ok) {
        onOptimistic?.({
          kind: staged.kind,
          body: "",
          storage_path: staged.storagePath,
          file_name: staged.fileName,
          mime_type: staged.mimeType,
          file_size: staged.fileSize,
          reply_to_message_id: replyTo?.id ? replyTo.id : null
        });
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

  if (disabled) {
    return (
      <div className="px-3 pb-3">
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
          <CheckCircle2 className="size-4 shrink-0" />
          {disabledLabel ?? "تم الانتهاء من تسليم هذا الواجب"}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Spacer so the scrollable content clears the fixed composer (non-fill layouts only) */}
      {!fill ? <div className="h-44 md:h-32" aria-hidden /> : null}
      <div
        className={cn(
          "border-t border-border/70 bg-background/95 backdrop-blur-xl",
          fill
            ? "rounded-b-[var(--radius-lg)]"
            : "fixed inset-x-0 bottom-0 z-40 shadow-raise"
        )}
      >
        <div className="mx-auto w-full max-w-5xl px-4 pt-2 md:px-6">
          <div className={cn("grid gap-2", fill ? "pb-2.5" : "pb-[calc(env(safe-area-inset-bottom)_+_var(--nav-h)_+_0.5rem)]")}>
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
              رد على {roleLabel(replyTo.sender_role)}
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

      <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1 shadow-card transition-shadow focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-primary"
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
        <form
          ref={textFormRef}
          action={(fd) => {
            const body = String(fd.get("body") ?? "").trim();
            if (body) {
              onOptimistic?.({ kind: "text", body, reply_to_message_id: replyTo?.id ? replyTo.id : null });
            }
            onCancelReply();
            return textAction(fd);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          {sendToken ? <input type="hidden" name="guestToken" value={sendToken} /> : null}
          <input type="hidden" name="replyToMessageId" value={replyTo?.id ?? ""} />
          <Input
            name="body"
            placeholder="اكتب رسالة..."
            disabled={disabled || sending || sendingVoice || sendingMedia}
            className="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
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
            className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-primary"
            disabled={disabled || anyBusy}
            onClick={() => setRecorderOpen((v) => !v)}
            aria-label="تسجيل رسالة صوتية"
          >
            <Mic className="size-[18px]" />
          </Button>
          <Button
            type={staged ? "button" : "submit"}
            size="icon"
            className="size-8 shrink-0 rounded-full"
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
          {pending.stage === "compress" ? (
            <span className="shrink-0 text-xs font-semibold text-primary">
              {pending.kind === "video" ? "ضغط الفيديو..." : "ضغط الصورة..."}
            </span>
          ) : null}
          <Progress value={pending.pct} className="h-1.5 flex-1" />
          <span className="min-w-9 text-end text-xs tabular-nums text-muted-foreground">{pending.pct}%</span>
          {pending.handle ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => pending.handle?.cancel()} className="rounded-full">
              إلغاء
            </Button>
          ) : null}
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