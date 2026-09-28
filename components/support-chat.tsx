"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ConversationThread, type ConversationThreadHandle, type ThreadMessage } from "@/components/conversation-thread";
import { MessageComposer, type ComposerActions, type ComposerUploader } from "@/components/message-composer";
import {
  createGuestUploadTicketAction,
  markSupportThreadReadAction,
  sendSupportImageMessageAction,
  sendSupportTextMessageAction,
  sendSupportVideoMessageAction,
  sendSupportVoiceMessageAction
} from "@/app/actions/support";
// Imported from the pure module, not "@/lib/support/queries": this file is a
// client component and the query module reaches `next/headers` through
// lib/supabase/server, which cannot be bundled for the browser.
import { supportRowToThreadMessage } from "@/lib/support/message";
import { uploadToSignedUrl } from "@/lib/upload";

const SUPPORT_BUCKET = "support-media";

const supportActions: ComposerActions = {
  text: sendSupportTextMessageAction,
  voice: sendSupportVoiceMessageAction,
  image: sendSupportImageMessageAction,
  video: sendSupportVideoMessageAction
};

/**
 * The support chat is the assignment chat pointed at a different set of tables.
 * `ConversationThread` and `MessageComposer` stay generic; everything that makes
 * it "support" lives in the props below.
 */
export function SupportChat({
  threadId,
  initial,
  signed,
  mineId,
  guestToken,
  live = true,
  pollLoad
}: {
  threadId: string;
  initial: ThreadMessage[];
  signed: Record<string, string | null>;
  mineId: string;
  /** Set only on the guest view. Presence switches the composer to the token flow. */
  guestToken?: string;
  live?: boolean;
  /** Guest-only delta fetch; mutually exclusive with realtime. */
  pollLoad?: (since: string) => Promise<{ messages: ThreadMessage[]; signed: Record<string, string | null> }>;
}) {
  const [reply, setReply] = useState<ThreadMessage | null>(null);
  const threadRef = useRef<ConversationThreadHandle>(null);

  const mapRow = useCallback(
    (row: Record<string, unknown>) =>
      // `guestToken` is only set in the guest's own view, where guest-authored
      // rows are the viewer's own and must be marked as such.
      supportRowToThreadMessage(row, mineId, guestToken ? mineId : undefined),
    [mineId, guestToken]
  );

  const onRead = useCallback((id: string) => {
    void markSupportThreadReadAction(id);
  }, []);

  /**
   * Guests have no session, so the composer's default uploader — which sends the
   * caller's access token — cannot work for them. This variant asks the server
   * for a signed upload target first, then pushes the bytes straight to storage.
   * `undefined` for signed-in users, which keeps the default uploader.
   */
  const uploader = useMemo<ComposerUploader | undefined>(() => {
    if (!guestToken) return undefined;
    return async (file, ext, onProgress) => {
      const ticket = await createGuestUploadTicketAction(threadId, guestToken, ext);
      if (!ticket) throw new Error("انتهت صلاحية المحادثة. افتح المحادثة من جديد.");
      return {
        path: ticket.path,
        handle: uploadToSignedUrl(file, ticket.signedUrl, ticket.token, { onProgress })
      };
    };
  }, [threadId, guestToken]);

  return (
    <>
      <ConversationThread
        ref={threadRef}
        conversationId={threadId}
        initial={initial}
        signed={signed}
        mineId={mineId}
        fill
        live={live}
        pollLoad={pollLoad}
        table="support_messages"
        idColumn="thread_id"
        bucket={SUPPORT_BUCKET}
        mapRow={mapRow}
        onRead={onRead}
        emptyText="ابدأ المحادثة، وهو هرد عليك هنا."
        onReply={(m) => setReply(m)}
      />
      <MessageComposer
        conversationId={threadId}
        disabled={false}
        replyTo={reply}
        onCancelReply={() => setReply(null)}
        fill
        actions={supportActions}
        bucket={SUPPORT_BUCKET}
        uploader={uploader}
        sendToken={guestToken}
        onOptimistic={(msg) => {
          threadRef.current?.addPending({ ...msg, sender_id: mineId });
        }}
      />
    </>
  );
}
