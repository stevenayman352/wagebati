import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  computeAssignmentStatus,
  TEACHER_STATUSES,
  type TeacherStatusKey
} from "@/lib/assignment-status";
import {
  TeacherStatistics,
  type HomeworkStat
} from "@/components/teacher-statistics";

type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  classes?: { name: string } | null;
};

type ConversationRow = {
  id: string;
  assignment_id: string;
  status: string;
  closed_by: string | null;
  student?: { full_name: string; code: string } | null;
};

export default async function TeacherStatisticsPage() {
  const profile = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  let teacherClassIds: string[] | null = null;
  if (profile.role !== "admin") {
    const { data } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("teacher_id", profile.id);
    teacherClassIds = (data ?? []).map((c) => c.class_id as string);
  }

  let assignmentQuery = supabase
    .from("assignments")
    .select("id, title, due_at, classes!inner(name)")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (teacherClassIds)
    assignmentQuery = assignmentQuery.in(
      "class_id",
      teacherClassIds.length ? teacherClassIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const { data: assignmentRows } = await assignmentQuery;
  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[];

  const assignmentIds = assignments.map((a) => a.id);
  const { data: convRows } = assignmentIds.length
    ? await supabase
        .from("conversations")
        .select("id, assignment_id, status, closed_by, student:profiles!conversations_student_id_fkey(full_name, code)")
        .in("assignment_id", assignmentIds)
    : { data: [] };
  const conversations = (convRows ?? []) as unknown as ConversationRow[];

  const conversationIds = conversations.map((c) => c.id);
  const [subsRes, gradesRes] = await Promise.all([
    conversationIds.length
      ? supabase.from("submissions").select("conversation_id").in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] }),
    conversationIds.length
      ? supabase.from("grades").select("conversation_id").in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] })
  ]);
  const chatActive = await fetchStudentChatActivity(supabase, conversationIds);

  const submittedIds = new Set((subsRes.data ?? []).map((s) => s.conversation_id as string));
  const gradedIds = new Set((gradesRes.data ?? []).map((g) => g.conversation_id as string));

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const homeworkStats: HomeworkStat[] = assignments.map((a) => {
    const convs = conversations.filter((c) => c.assignment_id === a.id);
    const counts = new Map<TeacherStatusKey, number>();
    for (const key of TEACHER_STATUSES) counts.set(key, 0);
    const students: Record<TeacherStatusKey, { name: string; code: string; conversationId: string }[]> = {
      not_submitted: [],
      under_review: [],
      awaiting_grading: [],
      overdue_not_submitted: [],
      graded: [],
      completed: []
    };

    for (const c of convs) {
      const key = computeAssignmentStatus({
        role: "teacher",
        status: c.status,
        closedBy: c.closed_by,
        hasGrade: gradedIds.has(c.id),
        hasSubmission: submittedIds.has(c.id),
        hasStudentMessage: chatActive.has(c.id),
        dueAt: a.due_at,
        nowMs
      }) as TeacherStatusKey;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      students[key].push({
        name: c.student?.full_name ?? "طالب",
        code: c.student?.code ?? "",
        conversationId: c.id
      });
    }

    return {
      id: a.id,
      title: a.title,
      dueAt: a.due_at,
      className: a.classes?.name ?? null,
      counts: Object.fromEntries(counts) as Record<TeacherStatusKey, number>,
      students
    };
  });

  return (
    <>
      <PageShell wide>
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
              <BarChart3 className="size-5 text-primary" />
            </span>
            <div>
              <h1 className="text-[var(--text-h1)] font-extrabold">إحصائيات الواجبات</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">كل واجب، وأسماء طلابه حسب الحالة</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/teacher" className="gap-1">
              <ArrowLeft className="size-4" />
              رجوع
            </Link>
          </Button>
        </header>

        <TeacherStatistics homeworkStats={homeworkStats} />
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}