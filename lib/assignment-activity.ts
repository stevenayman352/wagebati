import { fetchAllInChunks } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchStudentChatActivity(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Set<string>> {
  if (conversationIds.length === 0) return new Set();
  // Chunked AND paged: the id filter is a URL so it cannot hold thousands of
  // UUIDs (1086 of them answered 400 Bad Request), and the rows themselves grow
  // past the PostgREST per-request max-rows (1000 here) which drops the tail
  // silently with a HTTP 200.
  const rows = await fetchAllInChunks<{ conversation_id: string }>(conversationIds, (chunk, range) =>
    supabase
      .from("messages")
      .select("conversation_id")
      .eq("sender_role", "student")
      .in("conversation_id", chunk)
      .order("id")
      .range(range.from, range.to)
  );
  return new Set(rows.map((r) => r.conversation_id as string));
}
