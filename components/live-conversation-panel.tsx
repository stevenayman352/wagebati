"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ChatPanel } from "@/components/chat-panel";
import type { ThreadMessage } from "@/components/conversation-thread";

export function LiveConversationPanel({
  conversationId,
  dueAt,
  initialStatus,
  initial,
  signed,
  mineId,
  fill = false,
  showGrade = false,
  grade = null,
  maxGrade = 20
}: {
  conversationId: string;
  dueAt: string | null;
  initialStatus: string;
  initial: ThreadMessage[];
  signed: Record<string, string | null>;
  mineId: string;
  fill?: boolean;
  showGrade?: boolean;
  grade?: number | null;
  maxGrade?: number;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let disposed = false;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conv-status-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => {
          const next = (payload.new as { status?: string }).status;
          if (next && !disposed) setStatus(next);
        }
      )
      .subscribe();

    void markReadOnce(conversationId);

    const timer = setInterval(() => {
      if (!disposed) setNowMs(Date.now());
    }, 30000);

    return () => {
      disposed = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const dueMs = dueAt ? new Date(dueAt).getTime() : null;
  const overdue = dueMs !== null && nowMs > dueMs;
  const isClosed = status !== "active";
  const disabled = isClosed || overdue;

  return (
    <ChatPanel
      conversationId={conversationId}
      initial={initial}
      signed={signed}
      mineId={mineId}
      disabled={disabled}
      disabledLabel={isClosed ? undefined : "انتهى موعد هذا الواجب ولا يمكن إرسال رسائل جديدة"}
      fill={fill}
      showGrade={showGrade}
      grade={grade}
      maxGrade={maxGrade}
    />
  );
}

async function markReadOnce(conversationId: string) {
  const fd = new FormData();
  fd.set("conversationId", conversationId);
  const { markConversationReadAction } = await import("@/app/actions/messages");
  void markConversationReadAction(fd);
}