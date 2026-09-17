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
import { computeAssignmentStatus, isTeacherStatusKey, type TeacherStatusKey } from "@/lib/assignment-status";
import { formatAppDate } from "@/lib/dates";
import { ActiveHomeworksView, type ActiveHomeworkItem } from "@/components/active-homeworks-view";

type AssignmentRow = {
  id: string;
  title: string;
  due_at: string | null;
  max_grade: number;
  status: string;
  classes?: { name: string } | null;
  conversations?: ConversationElement[];
};

type ConversationElement = {
  id: string;
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
    .select(
      "id, title, due_at, max_grade, status, classes!inner(name), conversations(id, status, closed_by, grades(grade), submissions(count))"
    )
    .order("created_at", { ascending: false });
  if (classIds)
    assignmentQuery = assignmentQuery.in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: raw, error } = await assignmentQuery;
  if (error) throw new Error(`Failed to load assignments: ${error.message}`);

  const rows = (raw ?? []) as unknown as AssignmentRow[];

  const allConversationIds = rows.flatMap((a) => (a.conversations ?? []).map((c) => c.id));
  const chatActive = await fetchStudentChatActivity(supabase, allConversationIds);

  return { rows, chatActivityIds: [...chatActive] };
}

export default async function TeacherAssignmentsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await requireRole(["teacher", "admin"]);
  const { status } = await searchParams;

  const { rows, chatActivityIds } = await loadTeacherAssignments(profile.id, profile.role);
  const chatActive = new Set(chatActivityIds);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const hasActivity = (c: ConversationElement) => {
    const subCount = Array.isArray(c.submissions) ? (c.submissions[0]?.count ?? 0) : 0;
    const graded = c.grades?.grade !== undefined && c.grades?.grade !== null;
    return graded || subCount > 0 || chatActive.has(c.id);
  };

  const statusKeyFor = (a: AssignmentRow, c: ConversationElement): TeacherStatusKey => {
    const subCount = Array.isArray(c.submissions) ? (c.submissions[0]?.count ?? 0) : 0;
    const graded = c.grades?.grade !== undefined && c.grades?.grade !== null;
    return computeAssignmentStatus({
      role: "teacher",
      status: c.status,
      closedBy: c.closed_by,
      hasGrade: graded,
      hasSubmission: subCount > 0 || chatActive.has(c.id),
      hasStudentMessage: chatActive.has(c.id),
      dueAt: a.due_at ?? null,
      nowMs
    }) as TeacherStatusKey;
  };

  const activeItems: ActiveHomeworkItem[] = rows
    .filter(
      (a) =>
        a.status === "published" &&
        (a.due_at === null || new Date(a.due_at).getTime() >= nowMs) &&
        (a.conversations ?? []).some((c) => c.status === "active")
    )
    .map((a) => {
      const convs = a.conversations ?? [];
      const statusCounts: Partial<Record<TeacherStatusKey, number>> = {};
      for (const c of convs) {
        const key = statusKeyFor(a, c);
        statusCounts[key] = (statusCounts[key] ?? 0) + 1;
      }
      return {
        id: a.id,
        title: a.title,
        className: a.classes?.name ?? null,
        due_at: a.due_at,
        max_grade: a.max_grade,
        total: convs.length,
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
            const convs = a.conversations ?? [];
            const submittedCount = convs.filter(hasActivity).length;
            const notSubmittedCount = convs.length - submittedCount;
            const isDraft = a.status === "draft";
            const ended = !isDraft && a.due_at !== null && new Date(a.due_at).getTime() < nowMs;
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