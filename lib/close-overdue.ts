import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function ensureOverdueConversationsClosed(): Promise<number> {
  const admin = createSupabaseAdminClient();

  try {
    const { data, error } = await admin.rpc("close_overdue_conversations");
    if (!error) return typeof data === "number" ? data : 0;
  } catch {
    // RPC unavailable — fall back to the JS implementation below.
  }

  const nowIso = new Date().toISOString();

  const { data: overdue, error } = await admin
    .from("assignments")
    .select("id, title")
    .eq("status", "published")
    .not("due_at", "is", null)
    .lte("due_at", nowIso);
  if (error || !overdue?.length) return 0;

  const { data: closed, error: updateError } = await admin
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
  if (updateError || !closed?.length) return 0;

  const titleByAssignment = new Map(overdue.map((a) => [a.id, a.title]));
  const { data: existing } = await admin
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

  if (toInsert.length) await admin.from("notifications").insert(toInsert);

  return closed.length;
}
