"use client";

import { useRef, useState } from "react";
import { ConversationThread, type ConversationThreadHandle, type ThreadMessage } from "@/components/conversation-thread";
import { MessageComposer } from "@/components/message-composer";

export function ChatPanel({
  conversationId,
  initial,
  signed,
  mineId,
  disabled,
  disabledLabel,
  fill = false,
  showGrade = false,
  grade = null,
  maxGrade = 20
}: {
  conversationId: string;
  initial: ThreadMessage[];
  signed: Record<string, string | null>;
  mineId: string;
  disabled: boolean;
  disabledLabel?: string;
  fill?: boolean;
  showGrade?: boolean;
  grade?: number | null;
  maxGrade?: number;
}) {
  const [reply, setReply] = useState<ThreadMessage | null>(null);
  const threadRef = useRef<ConversationThreadHandle>(null);

  return (
    <>
      <ConversationThread
        ref={threadRef}
        conversationId={conversationId}
        initial={initial}
        signed={signed}
        mineId={mineId}
        fill={fill}
        onReply={(m) => setReply(m)}
        showGrade={showGrade}
        grade={grade}
        maxGrade={maxGrade}
      />
      <MessageComposer
        conversationId={conversationId}
        disabled={disabled}
        disabledLabel={disabledLabel}
        replyTo={reply}
        onCancelReply={() => setReply(null)}
        fill={fill}
        onOptimistic={(msg) => {
          threadRef.current?.addPending({
            ...msg,
            sender_id: mineId,
            sender_role: msg.sender_role ?? undefined
          });
        }}
      />
    </>
  );
}