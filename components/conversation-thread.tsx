"use client";

import { Fragment, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { markConversationReadAction } from "@/app/actions/messages";
import { MediaViewer } from "@/components/media-viewer";
import { VoiceMessagePlayer } from "@/components/voice-message-player";
import { formatAppTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

export type ThreadMessage = {
  id: string;
  sender_id: string;
  sender_role: string;
  kind: string;
  body: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  deleted_from_storage_at: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  _pending?: boolean;
};

export function formatTime(value: string) {
  return formatAppTime(value);
}

export function quotePreview(m: Pick<ThreadMessage, "kind" | "body">): string {
  if (m.kind === "text") return m.body;
  if (m.kind === "video") return "فيديو";
  if (m.kind === "image") return "صورة";
  if (m.kind === "voice") return "تسجيل صوتي";
  return "رسالة";
}

export function markRead(conversationId: string) {
  const fd = new FormData();
  fd.set("conversationId", conversationId);
  void markConversationReadAction(fd);
}

function dayKeyOf(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

export function dayKey(value: string): string {
  return dayKeyOf(new Date(value));
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function weekStartKey(now: Date): string {
  const d = startOfDay(now);
  d.setDate(d.getDate() - d.getDay());
  return dayKeyOf(d);
}

function weekdayName(value: string): string {
  return new Date(value).toLocaleDateString("ar", { weekday: "long" });
}

export function dayLabel(value: string, now: Date = new Date()): { line1: string; line2?: string } {
  const key = dayKey(value);
  const today = startOfDay(now);
  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (key === dayKeyOf(today)) return { line1: "اليوم" };
  if (key === dayKeyOf(yesterday)) return { line1: "أمس" };
  if (key >= weekStartKey(now)) return { line1: weekdayName(value) };

  const d = new Date(value);
  const date = d.toLocaleDateString("ar", { day: "numeric", month: "long" });
  return {
    line1: weekdayName(value),
    line2: d.getFullYear() !== now.getFullYear() ? `${date} ${d.getFullYear()}` : date
  };
}

function DaySeparator({ label }: { label: { line1: string; line2?: string } }) {
  return (
    <div className="mx-auto my-1 flex w-fit max-w-full flex-col items-center justify-center justify-self-center rounded-full bg-card/95 px-3 pb-[0.45rem] pt-[0.3rem] text-center shadow-sm ring-1 ring-border/60">
      <span className="text-xs font-bold leading-tight text-muted-foreground">{label.line1}</span>
      {label.line2 ? (
        <span className="text-[0.68rem] leading-tight text-muted-foreground/80">{label.line2}</span>
      ) : null}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  mineId,
  senderName,
  replied,
  url,
  onOpenViewer,
  onReply
}: {
  m: ThreadMessage;
  mine: boolean;
  mineId: string;
  senderName: string;
  replied: ThreadMessage | undefined;
  url: string | null | undefined;
  onOpenViewer: (kind: "image" | "video", src: string, fileName: string) => void;
  onReply?: (message: ThreadMessage) => void;
}) {
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  function handleSwipeDown(e: React.PointerEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, audio, video, input, summary")) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = { x: e.clientX, y: e.clientY };
  }

  function handleSwipeUp(e: React.PointerEvent<HTMLElement>) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx > 48 && dx > Math.abs(dy) * 1.5) onReply?.(m);
  }

  return (
    <article
      className={cn("flex items-end gap-1.5", mine ? "flex-row-reverse" : "")}
      onPointerDown={handleSwipeDown}
      onPointerUp={handleSwipeUp}
    >
      {!mine ? (
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-bold text-primary"
          )}
        >
          {m.sender_role === "teacher" ? "م" : "ط"}
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[80%] rounded-[16px] px-2.5 py-1 text-sm shadow-card animate-slide-up",
          m.kind === "video" ? "w-[min(92%,26rem)]" : "",
          mine
            ? "rounded-bl-[6px] bg-primary text-primary-foreground"
            : "rounded-br-[6px] bg-card text-foreground",
          m._pending ? "opacity-60" : ""
        )}
      >
        {replied ? (
          <div
            className={cn(
              "mb-1.5 rounded-md px-2 py-1 text-xs",
              mine ? "border-r-4 border-primary-foreground/40 bg-black/10 text-primary-foreground/90" : "border-r-4 border-primary/40 bg-muted/70 text-foreground/80"
            )}
          >
            <p className="mb-0.5 truncate font-bold">رد على {nameFor(replied, replied.sender_id === mineId)}</p>
            <p className="truncate opacity-80">{quotePreview(replied)}</p>
          </div>
        ) : null}
        {m.kind === "text" ? <p className="whitespace-pre-wrap leading-snug">{m.body}</p> : null}
        {m.kind === "image" && m.storage_path && !m.deleted_from_storage_at ? (
          <button
            type="button"
            className="block cursor-pointer p-0"
            onClick={() => {
              if (url) onOpenViewer("image", url, m.file_name ?? m.id);
            }}
            aria-label="فتح الصورة"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url ?? ""}
              alt={m.file_name ?? "صورة"}
              className={cn("max-h-72 rounded-lg border", mine ? "border-white/20" : "border-border/70")}
              loading="lazy"
            />
          </button>
        ) : null}
        {m.kind === "voice" && m.storage_path && !m.deleted_from_storage_at ? (
          <VoiceMessagePlayer src={url ?? ""} mine={mine} />
        ) : null}
        {m.kind === "video" && m.storage_path && !m.deleted_from_storage_at ? (
          <VideoThumbnail url={url} mine={mine} m={m} onOpenViewer={onOpenViewer} />
        ) : null}
        {m.deleted_from_storage_at ? (
          <p className="text-xs opacity-80">تم حذف الملف من التخزين وبقي السجل محفوظًا.</p>
        ) : null}
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[0.62rem]",
            mine ? "justify-start text-primary-foreground/70" : "justify-end text-muted-foreground"
          )}
        >
          {!mine ? <span className="font-semibold">{senderName}</span> : null}
          <span>{formatTime(m.created_at)}</span>
        </div>
      </div>
    </article>
  );
});

function VideoThumbnail({
  url,
  mine,
  m,
  onOpenViewer
}: {
  url: string | null | undefined;
  mine: boolean;
  m: ThreadMessage;
  onOpenViewer: (kind: "image" | "video", src: string, fileName: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!url) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-border/70 bg-muted/40">
        <span className="text-sm text-muted-foreground">جارِ التحميل...</span>
      </div>
    );
  }

  if (!loaded) {
    return (
      <button
        type="button"
        className="relative block w-full cursor-pointer p-0"
        onClick={() => setLoaded(true)}
        aria-label="تشغيل الفيديو"
      >
        <div className="flex h-48 w-full items-center justify-center rounded-lg border border-border/70 bg-muted/40">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm",
              mine ? "ring-2 ring-white/30" : ""
            )}
          >
            <svg viewBox="0 0 24 24" className="size-6 translate-x-[2px]" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="relative block w-full cursor-pointer p-0"
      onClick={() => onOpenViewer("video", url, m.file_name ?? m.id)}
      aria-label="فتح الفيديو"
    >
      <video
        src={url}
        className="pointer-events-none max-h-80 w-full rounded-lg border"
        muted
        playsInline
        controls
      />
    </button>
  );
}

function nameFor(m: ThreadMessage, isMine: boolean) {
  return isMine ? "أنت" : m.sender_role === "teacher" ? "المدرس" : "الطالب";
}

export type ConversationThreadHandle = {
  addPending: (msg: Partial<ThreadMessage> & { body: string; kind: string }) => void;
};

export const ConversationThread = forwardRef<ConversationThreadHandle, {
  conversationId: string;
  initial: ThreadMessage[];
  signed: Record<string, string | null>;
  mineId: string;
  fill?: boolean;
  onReply?: (message: ThreadMessage) => void;
  showGrade?: boolean;
  grade?: number | null;
  maxGrade?: number;
}>(function ConversationThread({
  conversationId,
  initial,
  signed,
  mineId,
  fill = false,
  onReply,
  showGrade = false,
  grade = null,
  maxGrade = 20
}, ref) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initial);
  const [urls, setUrls] = useState<Record<string, string | null>>(signed);
  const [viewer, setViewer] = useState<{ kind: "image" | "video"; src: string; fileName: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const signedRef = useRef(signed);

  useEffect(() => {
    signedRef.current = signed;
  }, [signed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const replyMap = useMemo(() => {
    const map = new Map<string, ThreadMessage>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  useEffect(() => {
    markRead(conversationId);

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const m = payload.new as ThreadMessage;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev.filter((x) => !x._pending || x.body !== m.body || x.sender_id !== m.sender_id), m];
          });
          if (m.storage_path && !signedRef.current[m.id]) {
            const { data } = await supabase.storage.from("message-media").createSignedUrl(m.storage_path, 600);
            setUrls((prev) => ({ ...prev, [m.id]: data?.signedUrl ?? null }));
          }
          markRead(conversationId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleOpenViewer = useCallback((kind: "image" | "video", src: string, fileName: string) => {
    setViewer({ kind, src, fileName });
  }, []);

  const handleCloseViewer = useCallback(() => setViewer(null), []);

  useImperativeHandle(ref, () => ({
    addPending: (msg) => {
      setMessages((prev) => addPendingMessage(prev, msg));
    }
  }), []);

  return (
    <div
      className={cn(
        "grid gap-1 overflow-y-auto rounded-[var(--radius-lg)] border border-border/70 bg-muted/40 p-2.5",
        fill ? "min-h-0 flex-1" : "max-h-[65vh] md:max-h-[72vh]"
      )}
      style={{
        backgroundImage: "radial-gradient(oklch(0.5 0.2 262 / 0.055) 1px, transparent 1px)",
        backgroundSize: "18px 18px"
      }}
    >
      {messages.map((m, i) => {
        const mine = m.sender_id === mineId;
        const senderName = nameFor(m, mine);
        const replied = m.reply_to_message_id ? replyMap.get(m.reply_to_message_id) : undefined;
        const prev = i > 0 ? messages[i - 1] : undefined;
        const dayIsNew = !prev || dayKey(m.created_at) !== dayKey(prev.created_at);
        return (
          <Fragment key={m.id}>
            {dayIsNew ? <DaySeparator label={dayLabel(m.created_at)} /> : null}
            <MessageBubble
              m={m}
              mine={mine}
              mineId={mineId}
              senderName={senderName}
              replied={replied}
              url={urls[m.id]}
              onOpenViewer={handleOpenViewer}
              onReply={onReply}
            />
          </Fragment>
        );
      })}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 p-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-xl" aria-hidden>
            💬
          </div>
          <p className="text-sm text-muted-foreground">لا توجد رسائل بعد. ابدأ المحادثة مع المدرس.</p>
        </div>
      ) : null}

      {showGrade && grade !== null ? (
        <div className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-bold text-success animate-slide-up">
          <Trophy className="size-4 shrink-0" />
          <span>
            الدرجة: {grade} من {maxGrade}
          </span>
        </div>
      ) : null}
      <div ref={bottomRef} />
      {viewer ? <MediaViewer kind={viewer.kind} src={viewer.src} fileName={viewer.fileName} onClose={handleCloseViewer} /> : null}
    </div>
  );
});

export function addPendingMessage(
  prev: ThreadMessage[],
  msg: Partial<ThreadMessage> & { body: string; kind: string }
): ThreadMessage[] {
  const pending: ThreadMessage = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender_id: msg.sender_id ?? "",
    sender_role: msg.sender_role ?? "",
    kind: msg.kind,
    body: msg.body,
    storage_path: msg.storage_path ?? null,
    file_name: msg.file_name ?? null,
    mime_type: msg.mime_type ?? null,
    file_size: msg.file_size ?? null,
    duration_seconds: msg.duration_seconds ?? null,
    deleted_from_storage_at: null,
    reply_to_message_id: msg.reply_to_message_id ?? null,
    created_at: new Date().toISOString(),
    _pending: true
  };
  return [...prev, pending];
}
