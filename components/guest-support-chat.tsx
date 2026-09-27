"use client";

import { useCallback, useState } from "react";
import { Check, Link2 } from "lucide-react";
import type { ThreadMessage } from "@/components/conversation-thread";
import { SupportChat } from "@/components/support-chat";
import { fetchGuestSupportMessages } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

/**
 * The guest view. Three differences from the signed-in chat, all driven by the
 * absence of a session:
 *
 *   - no realtime, because a Supabase realtime subscription needs a session;
 *     a 6s poll takes over and pauses while the tab is hidden
 *   - media upload goes through a signed upload ticket, since there is no access
 *     token to send
 *   - a "copy link" action is a first-class control, because the URL carrying the
 *     capability token is the only way back to this thread
 */
export function GuestSupportChat({
  threadId,
  token,
  initial,
  signed,
  mineId
}: {
  threadId: string;
  token: string;
  initial: ThreadMessage[];
  signed: Record<string, string | null>;
  mineId: string;
}) {
  const [copied, setCopied] = useState(false);

  const pollLoad = useCallback(
    async (since: string) => {
      const result = await fetchGuestSupportMessages(threadId, token, since);
      return result ?? { messages: [], signed: {} as Record<string, string | null> };
    },
    [threadId, token]
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address bar still holds the link.
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end px-2 pt-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyLink}
          className="gap-1.5 text-muted-foreground"
        >
          {copied ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
          {copied ? "تم النسخ" : "نسخ رابط المحادثة"}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <SupportChat
          threadId={threadId}
          initial={initial}
          signed={signed}
          mineId={mineId}
          guestToken={token}
          live={false}
          pollLoad={pollLoad}
        />
      </div>
    </div>
  );
}
