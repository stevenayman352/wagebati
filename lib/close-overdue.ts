import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function ensureOverdueConversationsClosed(): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("close_overdue_conversations");
    if (!error) return;
  } catch {
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const nowIso = new Date().toISOString();

    const { data: overdue, error } = await supabase
      .from("assignments")
      .select("id, title")
      .eq("status", "published")
      .lt("due_at", nowIso);
    if (error || !overdue?.length) return;

    const { data: closed, error: updateError } = await supabase
      .from("conversations")
      .update({
        status: "closed",
        closed_at: nowIso,
        closed_by: null,
        needs_revision: false,
        updated_at: nowIso
      })
      .eq("status", "active")
      .in("assignment_id", overdue.map((a) => a.id))
      .select("id, student_id, assignment_id");
    if (updateError || !closed?.length) return;

    const titleByAssignment = new Map(overdue.map((a) => [a.id, a.title]));
    const { data: existing } = await supabase
      .from("notifications")
      .select("conversation_id")
      .eq("type", "closed")
      .in("conversation_id", closed.map((c) => c.id));

    const existingIds = new Set((existing ?? []).map((n) => n.conversation_id));
    const toInsert = closed
      .filter((c) => !existingIds.has(c.id))
      .map((c) => ({
        user_id: c.student_id,
        type: "closed",
        title: "انتهى موعد الواجب",
        body: `انتهى الوقت المحدد لتسليم "${titleByAssignment.get(c.assignment_id) ?? ""}" وتُغلق المحادثة الآن.`,
        href: `/student/assignments/${c.id}`,
        assignment_id: c.assignment_id,
        conversation_id: c.id
      }));

    if (toInsert.length) await supabase.from("notifications").insert(toInsert);
  } catch {
    return;
  }
}