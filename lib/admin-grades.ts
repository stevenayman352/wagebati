import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Grade rows for the admin grade sheet.
 *
 * `grades` is the one table whose row level security does not include
 * `public.is_admin()`: a grade is visible to the graded student and to the
 * teachers of the assignment's class, and to nobody else. The permanent fix is
 * the migration in
 * supabase/migrations/202610210000_admin_grades_access.sql, which adds the
 * admin to both policies.
 *
 * Until that migration is applied to a project, the admin sheet reads and
 * writes this single table through the service-role client — the same way
 * app/api/export/route.ts already exports a class sheet. Everything else the
 * sheet touches (classes, students, assignments, conversations) goes through
 * the user-scoped client and stays under row level security.
 */

export type AdminGradeRow = {
  conversation_id: string;
  assignment_id: string;
  student_id: string;
  grade: number | null;
};

export async function fetchGradesForAssignments(assignmentIds: string[]): Promise<AdminGradeRow[]> {
  if (assignmentIds.length === 0) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("grades")
    .select("conversation_id, assignment_id, student_id, grade")
    .in("assignment_id", assignmentIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminGradeRow[];
}

export async function writeGradeRow(row: {
  conversationId: string;
  assignmentId: string;
  studentId: string;
  grade: number;
  gradedBy: string;
}): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("grades").upsert(
    {
      conversation_id: row.conversationId,
      assignment_id: row.assignmentId,
      student_id: row.studentId,
      grade: row.grade,
      comment: "",
      graded_by: row.gradedBy
    },
    { onConflict: "conversation_id" }
  );
  return { error: error?.message ?? null };
}

export async function removeGradeRow(conversationId: string): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("grades").delete().eq("conversation_id", conversationId);
  return { error: error?.message ?? null };
}
