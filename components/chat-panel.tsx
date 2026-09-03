"use client";

import { useState } from "react";
import { ConversationThread, type ThreadMessage } from "@/components/conversation-thread";
import { MessageComposer } from "@/components/message-composer";

export function ChatPanel({
  conversationId,
  initial,
  signed,
  mineId,
  disabled,
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
  fill?: boolean;
  showGrade?: boolean;
  grade?: number | null;
  maxGrade?: number;
}) {
  const [reply, setReply] = useState<ThreadMessage | null>(null);

  return (
    <>
      <ConversationThread
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
      <MessageComposer conversationId={conversationId} disabled={disabled} replyTo={reply} onCancelReply={() => setReply(null)} fill={fill} />
    </>
  );
}