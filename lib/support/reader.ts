import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

/**
 * Unread state for support lives in `support_thread_reads` rather than the
 * `notifications` table. There is no notification trigger and no web push for
 * support, so these counters are the only "you have something waiting" signal.
 *
 * `reader_key` is a single text column covering all three audiences:
 *   - "admin"     → the shared admin inbox
 *   - <uuid>      → a student, for their own thread
 *   - <tokenHash> → a guest, resolved in app code because guests are
 *                   unauthenticated and cannot call the SQL functions
 */

export const ADMIN_READER_KEY = "admin";

export function readerKeyForProfile(profile: Pick<Profile, "id" | "role">): string {
  return profile.role === "admin" ? ADMIN_READER_KEY : profile.id;
}

export type UnreadCounts = Record<string, number>;

/**
 * Per-thread unread counts. Drives the admin inbox rows and the student badge.
 * Implemented as an RPC so the aggregate happens in Postgres instead of pulling
 * every message of every visible thread into the server process.
 */
export async function supportUnreadCounts(
  profile: Pick<Profile, "id" | "role">
): Promise<UnreadCounts> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("support_unread_counts", {
    p_reader_key: readerKeyForProfile(profile)
  });

  if (error) {
    console.error("[support] unread counts failed:", error.message);
    return {};
  }

  const out: UnreadCounts = {};
  for (const row of (data ?? []) as { thread_id: string; unread_count: number }[]) {
    out[row.thread_id] = Number(row.unread_count);
  }
  return out;
}

/**
 * Scalar badge total. Kept as its own function so the badge is one round trip
 * rather than summing the per-thread result in JavaScript on every admin page.
 */
export async function supportUnreadTotal(profile: Pick<Profile, "id" | "role">): Promise<number> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("support_unread_total", {
    p_reader_key: readerKeyForProfile(profile)
  });

  if (error) {
    console.error("[support] unread total failed:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * Guest unread, computed in app code against the service role.
 *
 * Guests cannot call `support_unread_counts` (it is granted to `authenticated`
 * only, and a guest is not authenticated), and their token check has already
 * happened before we get here. Guest messages carry `author_profile_id is null`
 * and `author_kind = 'guest'`, so "not mine" means "author_kind <> 'guest'".
 */
export async function guestUnreadCount(threadId: string, tokenHash: string): Promise<number> {
  const admin = createSupabaseAdminClient();

  const { data: read, error: readError } = await admin
    .from("support_thread_reads")
    .select("last_read_at")
    .eq("thread_id", threadId)
    .eq("reader_key", tokenHash)
    .maybeSingle();

  if (readError) return 0;

  const since = read?.last_read_at ?? "-infinity";

  const { count, error: countError } = await admin
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("author_kind", "guest")
    .gt("created_at", since);

  if (countError) return 0;
  return count ?? 0;
}
