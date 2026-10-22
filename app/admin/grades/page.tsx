import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { GradeClassPicker } from "@/components/admin/grade-class-picker";
import { GradesSheet } from "@/components/admin/grades-sheet";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchGradesForAssignments } from "@/lib/admin-grades";
import { cacheLife, cacheTag } from "next/cache";
import { Table2 } from "lucide-react";
import {
  ARABIC_SORT,
  cellKey,
  type GradeClassOption,
  type GradeSheetAssignment,
  type GradeSheetCells,
  type GradeSheetStudent
} from "@/lib/grades";

export const metadata = { title: "جدول الدرجات" };

/**
 * The classes the admin can pick from. Kept separate from the sheet itself so
 * the picker renders even when no class is selected yet.
 */
async function loadGradeClasses(adminId: string): Promise<GradeClassOption[]> {
  "use cache: private";
  cacheTag(`grades:${adminId}`);
  cacheLife({ stale: 300 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("classes").select("id, name, grade_label");

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      gradeLabel: String(row.grade_label ?? "")
    }))
    .sort((a, b) => ARABIC_SORT.compare(a.name, b.name) || ARABIC_SORT.compare(a.gradeLabel, b.gradeLabel));
}

type ConversationRow = {
  id: string;
  assignment_id: string;
  student_id: string;
};

/**
 * The grade matrix of one class: its students, its published assignments, and
 * the conversation that carries each (assignment × student) grade.
 *
 * Conversations are created by database triggers for published assignments and
 * their enrolled students, so a cell that has no conversation simply has no
 * grade to record — the sheet shows it as unavailable rather than empty.
 */
async function loadGradeSheet(
  adminId: string,
  classId: string
): Promise<{
  className: string;
  students: GradeSheetStudent[];
  assignments: GradeSheetAssignment[];
  cells: GradeSheetCells;
}> {
  "use cache: private";
  cacheTag(`grades:${adminId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [classRes, studentsRes, assignmentsRes] = await Promise.all([
    supabase.from("classes").select("name").eq("id", classId).maybeSingle(),
    supabase
      .from("class_students")
      .select("student_id, student:profiles!class_students_student_id_fkey(full_name, code)")
      .eq("class_id", classId),
    supabase
      .from("assignments")
      .select("id, title, max_grade")
      .eq("class_id", classId)
      .eq("status", "published")
      .order("created_at", { ascending: true })
  ]);

  const students: GradeSheetStudent[] = (studentsRes.data ?? [])
    .map((row) => {
      const profile = row.student as { full_name?: string; code?: string } | null;
      return {
        id: String(row.student_id),
        name: String(profile?.full_name ?? ""),
        code: String(profile?.code ?? "")
      };
    })
    .sort((a, b) => ARABIC_SORT.compare(a.name, b.name) || ARABIC_SORT.compare(a.code, b.code));

  const assignments: GradeSheetAssignment[] = (assignmentsRes.data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    maxGrade: Number(row.max_grade ?? 20)
  }));

  const assignmentIds = assignments.map((a) => a.id);
  let conversations: ConversationRow[] = [];
  if (assignmentIds.length) {
    const { data } = await supabase
      .from("conversations")
      .select("id, assignment_id, student_id")
      .in("assignment_id", assignmentIds);
    conversations = (data ?? []) as unknown as ConversationRow[];
  }

  const gradeRows = await fetchGradesForAssignments(assignmentIds);
  const gradeByConversation = new Map(gradeRows.map((row) => [row.conversation_id, row.grade]));

  const cells: GradeSheetCells = {};
  for (const conversation of conversations) {
    const grade = gradeByConversation.get(conversation.id);
    cells[cellKey(conversation.assignment_id, conversation.student_id)] = {
      conversationId: String(conversation.id),
      grade: grade != null ? Number(grade) : null
    };
  }

  return {
    className: String(classRes.data?.name ?? ""),
    students,
    assignments,
    cells
  };
}

export default async function AdminGradesPage({
  searchParams
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const { class: classParam } = await searchParams;

  const classes = await loadGradeClasses(profile.id);
  const selectedId =
    classParam && classes.some((c) => c.id === classParam) ? classParam : classes[0]?.id ?? "";

  const sheet = selectedId ? await loadGradeSheet(profile.id, selectedId) : null;

  return (
    <AdminLayout
      profile={profile}
      title="جدول الدرجات"
      subtitle="تعديل درجات الطلاب مباشرة"
    >
      <AdminSection
        icon={Table2}
        title="جدول الدرجات"
        subtitle="اختر الصف، ثم اكتب الدرجة في الخانة — تُحفظ تلقائيًا."
      >
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد صفوف بعد.</p>
        ) : (
          <div className="space-y-4">
            <GradeClassPicker classes={classes} selectedId={selectedId} />
            {sheet ? (
              <GradesSheet
                classId={selectedId}
                className={sheet.className}
                students={sheet.students}
                assignments={sheet.assignments}
                cells={sheet.cells}
              />
            ) : null}
          </div>
        )}
      </AdminSection>
    </AdminLayout>
  );
}
