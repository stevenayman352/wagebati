import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchStudentChatActivity(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Set<string>> {
  if (conversationIds.length === 0) return new Set();
  const { data } = await supabase
    .from("messages")
    .select("conversation_id")
    .eq("sender_role", "student")
    .in("conversation_id", conversationIds);
  return new Set((data ?? []).map((m) => m.conversation_id as string));
}