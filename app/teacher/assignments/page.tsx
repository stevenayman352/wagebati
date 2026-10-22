import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { ClipboardList, FileText, ChevronUp } from "lucide-react";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  homeworkStudentStatuses,
  statusTotals,
  studentHasActivity
} from "@/lib/homework-students";
import { isTeacherStatusKey, type TeacherStatusKey } from "@/lib/assignment-status";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatAppDate } from "@/lib/dates";
import { ActiveHomeworksView, type ActiveHomeworkItem } from "@/components/active-homeworks-view";

type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  max_grade: number;
  status: string;
  class_id: string;
  classes?: { name: string } | null;
};

type ConversationRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  closed_by: string | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
};

async function loadTeacherAssignments(profileId: string, role: string) {
  "use cache: private";
  cacheTag(`assignments:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  let classIds: string[] | null = null;
  if (role !== "admin") {
    const { data } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", profileId);
    classIds = data?.map((c) => c.class_id as string) ?? [];
  }

  let assignmentQuery = supabase
    .from("assignments")
    .select("id, title, due_at, max_grade, status, class_id, classes!inner(name)")
    .order("created_at", { ascending: false });
  if (classIds)
    assignmentQuery = assignmentQuery.in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: raw, error } = await assignmentQuery;
  if (error) throw new Error(`Failed to load assignments: ${error.message}`);

  const rows = (raw ?? []) as unknown as AssignmentRow[];

  // The embedded conversations(...) are gone from the assignment select:
  // embedded resources ride inside one request, so they hit the same PostgREST
  // max-rows cap that was silently truncating them. Fetch them paged, and add
  // student_id + enrollment so the counts are per student, not per
  // conversation.
  const assignmentIds = rows.map((a) => a.id);
  const conversations = assignmentIds.length
    ? await fetchAll<ConversationRow>((range) =>
        supabase
          .from("conversations")
          .select("id, assignment_id, student_id, status, closed_by, grades(grade), submissions(count)")
          .in("assignment_id", assignmentIds)
          .order("id")
          .range(range.from, range.to)
      )
    : [];

  const pageClassIds = [...new Set(rows.map((a) => a.class_id).filter(Boolean))] as string[];
  const enrollRes = pageClassIds.length
    ? await supabase.from("class_students").select("class_id, student_id").in("class_id", pageClassIds)
    : { data: [] };

  const allConversationIds = conversations.map((c) => c.id);
  const chatActive = await fetchStudentChatActivity(supabase, allConversationIds);

  return {
    rows,
    conversations,
    enrollments: (enrollRes.data ?? []) as unknown as { class_id: string; student_id: string }[],
    chatActivityIds: [...chatActive]
  };
}

export default async function TeacherAssignmentsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await requireRole(["teacher", "admin"]);
  const { status } = await searchParams;

  const { rows, conversations, enrollments, chatActivityIds } = await loadTeacherAssignments(profile.id, profile.role);
  const chatActive = new Set(chatActivityIds);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const enrolledByClass = new Map<string, ReadonlySet<string>>();
  for (const e of enrollments) {
    const set = new Set(enrolledByClass.get(e.class_id) ?? []);
    set.add(e.student_id);
    enrolledByClass.set(e.class_id, set);
  }
  const conversationsByAssignment = new Map<string, ConversationRow[]>();
  for (const c of conversations) {
    const list = conversationsByAssignment.get(c.assignment_id) ?? [];
    list.push(c);
    conversationsByAssignment.set(c.assignment_id, list);
  }
  // A draft was never published, so "لم يسلموا" makes no sense for it —
  // drafts are measured against published homework only.
  const enrolledFor = (a: AssignmentRow) =>
    a.status === "published" ? (enrolledByClass.get(a.class_id) ?? new Set<string>()) : new Set<string>();

  const studentEntries = (a: AssignmentRow) =>
    homeworkStudentStatuses({
      enrolled: enrolledFor(a),
      conversations: (conversationsByAssignment.get(a.id) ?? []).map((c) => ({
        id: c.id,
        student_id: c.student_id,
        status: c.status,
        closed_by: c.closed_by,
        hasGrade:
          c.grades?.grade !== undefined && c.grades?.grade !== null,
        hasSubmission:
          (Array.isArray(c.submissions) ? (c.submissions[0]?.count ?? 0) : 0) > 0 ||
          chatActive.has(c.id),
        hasStudentMessage: chatActive.has(c.id)
      })),
      dueAt: a.due_at ?? null,
      nowMs
    });

  const activeItems: ActiveHomeworkItem[] = rows
    .filter(
      (a) =>
        a.status === "published" &&
        (a.due_at === null || new Date(a.due_at).getTime() >= nowMs) &&
        (conversationsByAssignment.get(a.id) ?? []).some((c) => c.status === "active")
    )
    .map((a) => {
      const totals = statusTotals(studentEntries(a));
      const statusCounts: Partial<Record<TeacherStatusKey, number>> = {};
      for (const [key, count] of totals) statusCounts[key] = count;
      return {
        id: a.id,
        title: a.title,
        className: a.classes?.name ?? null,
        due_at: a.due_at,
        max_grade: a.max_grade,
        total: studentEntries(a).size,
        statusCounts
      };
    });

  const activeTab: TeacherStatusKey | "all" =
    status !== undefined && status !== "all" && isTeacherStatusKey(status) ? status : "all";
  const showActiveView = status !== undefined && (status === "all" || isTeacherStatusKey(status));

  const formatDue = (due: string | null) => {
    if (!due) return "بدون موعد";
    return formatAppDate(due);
  };

  return (
    <>
      <PageShell>
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
              <ClipboardList className="size-5 text-primary" />
            </span>
            <div>
              <h1 className="text-[var(--text-h1)] font-extrabold">
                {showActiveView ? "الواجبات النشطة" : "الواجبات"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {showActiveView ? "واجبات الأسبوع الحالي فقط" : "تابع تسليمات طلابك لكل واجب"}
              </p>
            </div>
          </div>
          <BackButton fallbackHref="/teacher" />
        </header>

        {showActiveView ? (
          <ActiveHomeworksView items={activeItems} initialTab={activeTab} />
        ) : (
        <div className="grid gap-2.5">
          {rows.map((a) => {
            const entries = studentEntries(a);
            const submittedCount = [...entries.values()].filter(studentHasActivity).length;
            const notSubmittedCount = entries.size - submittedCount;
            const isDraft = a.status === "draft";
            const hasActiveConversation = (conversationsByAssignment.get(a.id) ?? []).some(
              (c) => c.status === "active"
            );
            const ended =
              !isDraft &&
              ((a.due_at !== null && new Date(a.due_at).getTime() < nowMs) ||
                ((conversationsByAssignment.get(a.id) ?? []).length > 0 && !hasActiveConversation));
            return (
              <Link
                key={a.id}
                href={`/teacher/assignments/${a.id}`}
                className="group rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
              >
                <div className="flex items-start gap-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-bold">{a.title}</span>
                      <Badge variant={isDraft ? "secondary" : ended ? "secondary" : "success"}>
                        {isDraft ? "مسودة" : ended ? "منتهي" : "نشط"}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.classes?.name ? `فصل ${a.classes.name}` : "بدون صف"}
                    </div>
                    <div className="text-xs text-muted-foreground">الدرجة: {a.max_grade} من {a.max_grade}</div>
                    <div className="text-xs text-muted-foreground">التسليم: {formatDue(a.due_at)}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                        {submittedCount} طالب سلموا
                      </div>
                      {notSubmittedCount > 0 ? (
                        <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {notSubmittedCount} لم يسلموا
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <ChevronUp className="mt-1 size-4 rotate-180 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              لا توجد واجبات بعد.
            </p>
          ) : null}
        </div>
        )}
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}