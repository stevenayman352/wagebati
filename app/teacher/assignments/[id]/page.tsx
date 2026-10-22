import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { FileText, GraduationCap, ChevronUp } from "lucide-react";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  homeworkStudentStatuses,
  studentHasActivity
} from "@/lib/homework-students";
import { type TeacherStatusKey } from "@/lib/assignment-status";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { StatusPill, statusVisual } from "@/components/status-chip";
import { ConfirmCloseAssignment } from "@/components/confirm-close-assignment";
import { ReopenAssignmentDialog } from "@/components/reopen-assignment-dialog";

const GROUPS: { label: string; dot: string; keys: TeacherStatusKey[] }[] = [
  {
    label: "بحاجة متابعة",
    dot: "bg-warning",
    keys: ["under_review", "awaiting_grading"]
  },
  {
    label: "لم يسلموا بعد",
    dot: "bg-muted-foreground",
    keys: ["not_submitted", "overdue_not_submitted"]
  },
  {
    label: "تم التقييم",
    dot: "bg-success",
    keys: ["graded", "completed"]
  }
];

type ConversationRow = {
  id: string;
  student_id: string;
  status: string;
  closed_by: string | null;
  last_message_at: string | null;
  student?: { full_name: string; code: number } | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
};

type AssignmentData = {
  id: string;
  title: string;
  max_grade: number;
  due_at: string | null;
  status: string;
  classes?: { name: string; id: string } | null;
};

async function loadTeacherAssignment(profileId: string, assignmentId: string) {
  "use cache: private";
  cacheTag(`assignments:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select("id, title, max_grade, due_at, status, classes!inner(name, id)")
    .eq("id", assignmentId)
    .single();
  if (!assignmentData) return null;
  const assignment = assignmentData as unknown as AssignmentData;

  const classId = assignment.classes?.id;

  // Enrollment drives the student list; conversations (paged past the
  // PostgREST max-rows cap) only carry the status of students who opened the
  // homework. Both runs start once the class id is known.
  const [convRows, enrollRes] = await Promise.all([
    fetchAll<ConversationRow>((range) =>
      supabase
        .from("conversations")
        .select(
          "id, student_id, status, closed_by, last_message_at, student:profiles!conversations_student_id_fkey(full_name, code), grades(grade), submissions(count)"
        )
        .eq("assignment_id", assignmentId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(range.from, range.to)
    ),
    classId
      ? supabase
          .from("class_students")
          .select("student_id, student:profiles!class_students_student_id_fkey(full_name, code)")
          .eq("class_id", classId)
      : Promise.resolve({ data: [] })
  ]);

  const conversationIds = convRows.map((r) => r.id);

  const [chatActive, subsRes] = await Promise.all([
    fetchStudentChatActivity(supabase, conversationIds),
    conversationIds.length
      ? supabase.from("submissions").select("conversation_id").in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] })
  ]);

  return {
    assignment,
    rows: convRows,
    enrollments: (enrollRes.data ?? []) as unknown as {
      student_id: string;
      student: { full_name: string; code: number } | null;
    }[],
    submittedConversationIds: (subsRes.data ?? []).map((s) => s.conversation_id as string),
    chatActivityIds: [...chatActive]
  };
}

export default async function TeacherAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;

  const isAdmin = profile.role === "admin";

  // The teacher-class authorization read depends only on the signed-in teacher,
  // not on the assignment row, so it runs alongside the (cached) assignment
  // load instead of after it — removing a round trip from the critical path.
  // It lists the teacher's own class memberships (the exact query the teacher
  // dashboard and assignments list already use) and the membership test against
  // the loaded assignment's class id below is equivalent to filtering
  // `class_teachers` by that class id.
  const taughtClassIdsPromise = isAdmin
    ? null
    : (async () => {
        const supabase = await createSupabaseServerClient();
        const { data } = await supabase
          .from("class_teachers")
          .select("class_id")
          .eq("teacher_id", profile.id);
        return (data ?? []).map((row) => row.class_id as string);
      })();

  const loaded = await loadTeacherAssignment(profile.id, id);
  if (!loaded) {
    // Consume the in-flight authorization read so a rejection can't surface as
    // an unhandled error on the not-found path.
    await taughtClassIdsPromise?.catch(() => []);
    notFound();
  }
  const { assignment, rows, enrollments, submittedConversationIds, chatActivityIds } = loaded;

  if (!isAdmin) {
    const classId = assignment.classes?.id;
    const taughtClassIds = (await taughtClassIdsPromise) ?? [];
    if (!classId || !taughtClassIds.includes(classId)) notFound();
  }

  const hasSubmission = new Set(submittedConversationIds);
  const chatActive = new Set(chatActivityIds);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const maxGrade = assignment.max_grade ?? 20;

  // Student-based list: enrollment is the denominator, conversations carry
  // the status. Students who never opened the homework get a row linking to
  // their profile page instead of a conversation.
  const enrolled = new Set(enrollments.map((e) => e.student_id));
  const profileByStudent = new Map<string, { full_name: string; code: number }>();
  for (const e of enrollments) {
    if (e.student) profileByStudent.set(e.student_id, e.student);
  }
  for (const r of rows) {
    if (r.student && !profileByStudent.has(r.student_id)) {
      profileByStudent.set(r.student_id, r.student);
    }
  }

  const entries = homeworkStudentStatuses({
    enrolled,
    conversations: rows.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      status: r.status,
      closed_by: r.closed_by,
      hasGrade: r.grades?.grade !== undefined && r.grades?.grade !== null,
      hasSubmission: hasSubmission.has(r.id) || (r.submissions?.[0]?.count ?? 0) > 0,
      hasStudentMessage: chatActive.has(r.id)
    })),
    dueAt: assignment.due_at,
    nowMs
  });

  const rowById = new Map(rows.map((r) => [r.id, r]));
  type StudentItem = {
    key: string;
    href: string;
    name: string;
    code: string | number;
    grade: number | null;
    statusKey: TeacherStatusKey;
  };
  const withStatus: StudentItem[] = [...entries.values()].map((entry) => {
    const row = entry.conversationId ? rowById.get(entry.conversationId) : undefined;
    const profile = profileByStudent.get(entry.studentId);
    return {
      key: entry.conversationId ?? `student:${entry.studentId}`,
      href: entry.conversationId
        ? `/teacher/conversations/${entry.conversationId}`
        : `/teacher/classes/${assignment.classes?.id}/students/${entry.studentId}`,
      name: row?.student?.full_name ?? profile?.full_name ?? "طالب",
      code: row?.student?.code ?? profile?.code ?? "",
      grade: row?.grades?.grade ?? null,
      statusKey: entry.statusKey
    };
  });
  const submittedCount = [...entries.values()].filter(studentHasActivity).length;

  // Confirm-close / reopen decisions stay conversation-based: they are about
  // closing or reopening the existing chat sessions, not the student list.
  const activeCount = rows.filter((r) => r.status === "active").length;
  const conversationEntries = [...entries.values()].filter((e) => e.conversationId !== null);
  const conversationCompletedCount = conversationEntries.filter(
    (e) => e.statusKey === "completed"
  ).length;

  return (
    <>
      <PageShell>
        <div className="mb-5 flex items-center justify-between gap-3">
          <BackButton fallbackHref="/teacher/assignments" />
          {assignment.status === "published" ? (
            activeCount > 0 ? (
              <ConfirmCloseAssignment assignmentId={assignment.id} />
            ) : (
              <ReopenAssignmentDialog
                assignmentId={assignment.id}
                disabled={
                  conversationEntries.length > 0 &&
                  conversationCompletedCount === conversationEntries.length
                }
              />
            )
          ) : null}
        </div>

        <header className="mb-6 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12">
            <FileText className="size-6 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[var(--text-h1)] font-extrabold">{assignment.title}</h1>
            <p dir="rtl" className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              {assignment.classes?.name ? (
                <>
                  <span className="min-w-0 truncate">
                    فصل {assignment.classes.name}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span className="whitespace-nowrap">
                {maxGrade} درجة
              </span>
            </p>
          </div>
        </header>

        <h2 className="mb-2.5 flex items-center gap-2 font-bold">
          <GraduationCap className="size-4 text-primary" />
          الطلاب
          <span className="text-sm font-normal text-muted-foreground">
            ({withStatus.length}) · سلموا {submittedCount}
          </span>
        </h2>

        {GROUPS.map((group) => {
          const items = withStatus.filter((c) => group.keys.includes(c.statusKey));
          if (items.length === 0) return null;
          return (
            <section key={group.label} className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className={`size-2 rounded-full ${group.dot}`} />
                <h3 className="font-bold">{group.label}</h3>
                <span className="text-sm text-muted-foreground">({items.length})</span>
              </div>
              <div className="grid gap-2">
                {items.map((c) => {
                  const { Icon, cls } = statusVisual(c.statusKey);
                  return (
                    <Link
                      key={c.key}
                      href={c.href}
                      className="flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
                    >
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cls}`}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold">{c.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">الكود: {c.code ?? ""}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {c.grade !== null ? (
                          <Badge className="bg-success/10 text-success">
                            {c.grade} / {maxGrade}
                          </Badge>
                        ) : null}
                        <StatusPill statusKey={c.statusKey} />
                        <ChevronUp className="size-4 rotate-180 shrink-0 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {withStatus.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            لا يوجد طلاب مرتبطون بهذا الواجب بعد.
          </p>
        ) : null}
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}