import { cacheLife, cacheTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { BarChart3 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  homeworkStudentStatuses,
  statusTotals,
  type StudentHomeworkConversation
} from "@/lib/homework-students";
import { type TeacherStatusKey } from "@/lib/assignment-status";
import { fetchAll, fetchAllInChunks } from "@/lib/supabase/fetch-all";
import {
  TeacherStatistics,
  type HomeworkStat
} from "@/components/teacher-statistics";

type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  class_id: string | null;
  teacher?: { full_name: string } | null;
  classes?: { name: string } | null;
};

type ConversationRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  closed_by: string | null;
  student?: { full_name: string; code: string } | null;
};

async function loadTeacherStatistics(profileId: string, role: string) {
  "use cache: private";
  cacheTag(`statistics:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  let teacherClassIds: string[] | null = null;
  if (role !== "admin") {
    const { data } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("teacher_id", profileId);
    teacherClassIds = (data ?? []).map((c) => c.class_id as string);
  }

  let assignmentQuery = admin
    .from("assignments")
    .select("id, title, due_at, class_id, teacher:profiles!assignments_teacher_id_fkey(full_name), classes!inner(name)")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (teacherClassIds)
    assignmentQuery = assignmentQuery.in(
      "class_id",
      teacherClassIds.length ? teacherClassIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const { data: assignmentRows } = await assignmentQuery;
  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[];

  const classIds = [
    ...new Set(assignments.map((a) => a.class_id).filter((c): c is string => Boolean(c)))
  ];
  const assignmentIds = assignments.map((a) => a.id);

  // Both reads are independent of each other — one is keyed by the assignments'
  // class ids, the other by their own ids — so they run concurrently rather
  // than as two sequential round trips.
  // Conversations are paged: their table outgrew the PostgREST per-request
  // max-rows cap (this project answers 200 OK while dropping rows past 1000).
  const [teacherRowsRes, convRowsRes, enrollRes] = await Promise.all([
    classIds.length
      ? admin
          .from("class_teachers")
          .select("class_id, teacher:profiles!class_teachers_teacher_id_fkey(full_name)")
          .in("class_id", classIds)
      : Promise.resolve({ data: [] as { class_id: string | null; teacher: { full_name: string } | null }[] }),
    assignmentIds.length
      ? fetchAll<ConversationRow>((range) =>
          supabase
            .from("conversations")
            .select(
              "id, assignment_id, student_id, status, closed_by, student:profiles!conversations_student_id_fkey(full_name, code)"
            )
            .in("assignment_id", assignmentIds)
            .order("id")
            .range(range.from, range.to)
        )
      : Promise.resolve([] as ConversationRow[]),
    classIds.length
      ? supabase
          .from("class_students")
          .select("class_id, student_id, student:profiles!class_students_student_id_fkey(full_name, code)")
          .in("class_id", classIds)
      : Promise.resolve({ data: [] })
  ]);

  const teacherByClass = new Map<string, string[]>();
  for (const row of teacherRowsRes.data ?? []) {
    const name = (row.teacher as unknown as { full_name: string } | null)?.full_name;
    if (!row.class_id || !name) continue;
    const list = teacherByClass.get(row.class_id) ?? [];
    list.push(name);
    teacherByClass.set(row.class_id, list);
  }

  // Current enrollment per class (the homework's real students) and a
  // student → profile map so students without a conversation row still have a
  // name and code on the statistics page.
  const enrolledByClass: Record<string, string[]> = {};
  const profiles: Record<string, { name: string; code: string }> = {};
  for (const row of (enrollRes.data ?? []) as unknown as {
    class_id: string;
    student_id: string;
    student: { full_name: string; code: string } | null;
  }[]) {
    (enrolledByClass[row.class_id] ??= []).push(row.student_id);
    if (row.student) {
      profiles[row.student_id] = { name: row.student.full_name ?? "", code: row.student.code ?? "" };
    }
  }

  const conversations = convRowsRes;
  for (const c of conversations) {
    if (c.student && !profiles[c.student_id]) {
      profiles[c.student_id] = { name: c.student.full_name ?? "", code: c.student.code ?? "" };
    }
  }

  const conversationIds = conversations.map((c) => c.id);
  // All three depend only on the conversation ids, so they share one round trip.
  // The ids are chunked: their list is part of the request URL and a few
  // thousand UUIDs overflow it (PostgREST answers 400 Bad Request), while the
  // rows themselves are paged past the per-request max-rows cap.
  const [submittedIds, gradedIds, chatActive] = await Promise.all([
    conversationIds.length
      ? fetchAllInChunks<{ conversation_id: string }>(conversationIds, (chunk, range) =>
          supabase
            .from("submissions")
            .select("conversation_id")
            .in("conversation_id", chunk)
            .order("id")
            .range(range.from, range.to)
        )
      : Promise.resolve([] as { conversation_id: string }[]),
    conversationIds.length
      ? fetchAllInChunks<{ conversation_id: string }>(conversationIds, (chunk, range) =>
          supabase
            .from("grades")
            .select("conversation_id")
            .in("conversation_id", chunk)
            .order("id")
            .range(range.from, range.to)
        )
      : Promise.resolve([] as { conversation_id: string }[]),
    fetchStudentChatActivity(supabase, conversationIds)
  ]);

  return {
    assignments,
    conversations,
    teacherByClass,
    enrolledByClass,
    profiles,
    submittedIds: submittedIds.map((s) => s.conversation_id),
    gradedIds: gradedIds.map((g) => g.conversation_id),
    chatActivityIds: [...chatActive]
  };
}

export default async function TeacherStatisticsPage() {
  const profile = await requireRole(["teacher", "admin"]);

  const data = await loadTeacherStatistics(profile.id, profile.role);
  const { assignments, conversations } = data;
  const teacherByClass = data.teacherByClass;

  const submittedIds = new Set(data.submittedIds);
  const gradedIds = new Set(data.gradedIds);
  const chatActive = new Set(data.chatActivityIds);

  const enrolledByClass = new Map<string, ReadonlySet<string>>();
  for (const [classId, ids] of Object.entries(data.enrolledByClass)) {
    enrolledByClass.set(classId, new Set(ids));
  }
  const profileByStudent = new Map(Object.entries(data.profiles)) as Map<
    string,
    { name: string; code: string }
  >;
  const NO_ENROLLMENT: ReadonlySet<string> = new Set();

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const homeworkStats: HomeworkStat[] = assignments.map((a) => {
    const convs = conversations.filter((c) => c.assignment_id === a.id);
    const ended =
      (a.due_at !== null && new Date(a.due_at).getTime() < nowMs) ||
      (convs.length > 0 && !convs.some((c) => c.status === "active"));

    const entries = homeworkStudentStatuses({
      enrolled: enrolledByClass.get(a.class_id ?? "") ?? NO_ENROLLMENT,
      conversations: convs.map(
        (c): StudentHomeworkConversation => ({
          id: c.id,
          student_id: c.student_id,
          status: c.status,
          closed_by: c.closed_by,
          hasGrade: gradedIds.has(c.id),
          hasSubmission: submittedIds.has(c.id),
          hasStudentMessage: chatActive.has(c.id)
        })
      ),
      dueAt: a.due_at,
      nowMs
    });
    const counts = statusTotals(entries);

    const students: Record<TeacherStatusKey, { id: string; name: string; code: string; conversationId: string | null; href: string }[]> = {
      not_submitted: [],
      under_review: [],
      awaiting_grading: [],
      overdue_not_submitted: [],
      graded: [],
      completed: []
    };
    for (const entry of entries.values()) {
      const profile = profileByStudent.get(entry.studentId);
      students[entry.statusKey].push({
        id: entry.studentId,
        name: profile?.name ?? "طالب",
        code: profile?.code ?? "",
        conversationId: entry.conversationId,
        href: entry.conversationId
          ? `/teacher/conversations/${entry.conversationId}`
          : `/teacher/classes/${a.class_id}/students/${entry.studentId}`
      });
    }

    const teacherNames = teacherByClass.get(a.class_id ?? "") ?? [];
    const ownTeacher = (a.teacher as unknown as { full_name: string } | null)?.full_name;
    if (ownTeacher && !teacherNames.includes(ownTeacher)) teacherNames.push(ownTeacher);

    return {
      id: a.id,
      title: a.title,
      dueAt: a.due_at,
      ended,
      className: a.classes?.name ?? null,
      teacherNames,
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
          <BackButton fallbackHref="/teacher" />
        </header>

        <TeacherStatistics homeworkStats={homeworkStats} />
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}