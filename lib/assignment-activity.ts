import { fetchAll } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchStudentChatActivity(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Set<string>> {
  if (conversationIds.length === 0) return new Set();
  // Paged: student messages across many conversations grow past the
  // PostgREST per-request max-rows (this project caps at 1000 rows per
  // request), and unpaged responses drop the tail silently with a HTTP 200.
  const rows = await fetchAll<{ conversation_id: string }>((range) =>
    supabase
      .from("messages")
      .select("conversation_id")
      .eq("sender_role", "student")
      .in("conversation_id", conversationIds)
      .order("id")
      .range(range.from, range.to)
  );
  return new Set(rows.map((r) => r.conversation_id as string));
}
