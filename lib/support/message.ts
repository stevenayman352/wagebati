import type { ThreadMessage } from "@/components/conversation-thread";

/**
 * Pure projection helpers for the support tables.
 *
 * Deliberately free of any server-only import: `components/support-chat.tsx` is a
 * client component and reaches these through the realtime row mapper, so pulling
 * in `lib/supabase/server` (which uses `next/headers`) here would drag
 * server-only code into the browser bundle. `import type` is erased at compile
 * time, so depending on the component for its type is safe.
 */

export const SUPPORT_MESSAGE_COLUMNS =
  "id, author_profile_id, author_kind, guest_name, kind, body, storage_path, file_name, mime_type, file_size, duration_seconds, reply_to_message_id, created_at";

export type LooseRow = Record<string, unknown>;

export type SupportMessageRow = {
  id: string;
  author_profile_id: string | null;
  author_kind: "student" | "admin" | "guest";
  guest_name: string | null;
  kind: string;
  body: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  reply_to_message_id: string | null;
  created_at: string;
};

export type SupportThreadRow = {
  id: string;
  profile_id: string | null;
  guest_name: string;
  guest_code: string;
  last_message_at: string;
  created_at: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export { str };

/**
 * Projects a support row onto the shape `ConversationThread` already understands.
 *
 * The support tables use `author_profile_id` / `author_kind`; the chat component
 * reads `sender_id` / `sender_role`. Aliasing in SQL does most of the work, but
 * one thing SQL cannot express is "for a guest, every null author is me", which
 * is what `guestId` is for.
 *
 * `guestId` must only ever be passed on a guest page. If an admin passed it,
 * every guest message in the thread would resolve to the admin's own id and
 * render as a right-aligned outgoing bubble.
 */
export function toThreadMessage(row: LooseRow, mineId: string, guestId?: string): ThreadMessage {
  return {
    id: String(row.id ?? ""),
    sender_id: str(row.author_profile_id) ?? guestId ?? "",
    sender_role: str(row.author_kind) ?? "",
    kind: str(row.kind) ?? "text",
    body: str(row.body) ?? "",
    storage_path: str(row.storage_path),
    file_name: str(row.file_name),
    mime_type: str(row.mime_type),
    file_size: typeof row.file_size === "number" ? row.file_size : null,
    duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    deleted_from_storage_at: null,
    reply_to_message_id: str(row.reply_to_message_id),
    created_at: str(row.created_at) ?? new Date().toISOString(),
    display_name: str(row.guest_name)
  };
}

/**
 * Same projection for a realtime `postgres_changes` payload or a poll row, which
 * arrive as a loose record.
 *
 * `guestAuthorId` is the id the guest's *own* rows should carry, and is set only
 * in the guest's own view. There a thread has exactly one guest, so a row with a
 * null `author_profile_id` is by definition the viewer's own message. Without it
 * such a row mapped to `""`, which put the guest's own message on the incoming
 * side and broke the pending/realtime de-duplication, drawing every message the
 * guest sent twice.
 */
export function supportRowToThreadMessage(
  row: LooseRow,
  mineId: string,
  guestAuthorId?: string
): ThreadMessage {
  return toThreadMessage(row, mineId, guestAuthorId);
}

/**
 * Escapes the wildcards PostgREST's `like`/`ilike` would otherwise interpret, so
 * a search for "50%" or "a_b" matches that literal text. The backslash is the
 * escape character itself, so it has to be doubled too.
 *
 * Lives here rather than in `queries.ts` because that module imports
 * `lib/supabase/server` (next/headers) and could not be unit tested.
 */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/([\\%_])/g, "\\$1");
}
