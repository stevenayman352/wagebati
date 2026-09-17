import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/page-shell";
import { AssignmentItem } from "@/components/assignment-item";
import { cacheLife, cacheTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOverdueConversationsClosed } from "@/lib/close-overdue";
import { NotificationGate } from "@/components/notification-gate";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  computeAssignmentStatus,
  STATUS_LABEL,
  STUDENT_STATUSES,
  type StudentStatusKey
} from "@/lib/assignment-status";
import { Home, Mail, Hash } from "lucide-react";

type Row = {
  id: string;
  status: string;
  closed_by: string | null;
  closed_at: string | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
  assignment?: {
    title?: string;
    due_at?: string | null;
    max_grade?: number;
    status?: string;
    classes?: { name?: string } | null;
  } | null;
};

const GROUP_ACCENT: Record<StudentStatusKey, string> = {
  not_submitted: "text-muted-foreground bg-muted border-border",
  under_review: "text-primary bg-primary/10 border-primary/20",
  submitted: "text-success bg-success/12 border-success/20",
  missed: "text-destructive bg-destructive/10 border-destructive/20",
  completed: "text-foreground/90 bg-secondary border-foreground/20"
};

const STATUS_TITLES = {
  not_submitted: STATUS_LABEL.not_submitted,
  under_review: STATUS_LABEL.under_review,
  submitted: STATUS_LABEL.submitted,
  missed: STATUS_LABEL.missed,
  completed: STATUS_LABEL.completed
} as const;

async function loadStudentDashboard(studentId: string) {
  "use cache: private";
  cacheTag(`student-dashboard:${studentId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [convRes, unreadRes] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, status, closed_by, closed_at, grades(grade), submissions(count), assignment:assignments!inner(title, due_at, max_grade, status, classes!inner(name))"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", studentId)
      .eq("is_read", false)
  ]);
  const rows = (convRes.data ?? []) as unknown as Row[];

  const conversationIds = rows.map((r) => r.id);
  const chatActive = await fetchStudentChatActivity(supabase, conversationIds);

  return {
    rows,
    unreadCount: unreadRes.count ?? 0,
    chatActivityIds: [...chatActive]
  };
}

export default async function StudentPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireRole(["student"]);
  const { tab } = await searchParams;

  void ensureOverdueConversationsClosed();

  if (tab === "account") {
    return (
      <>
        <PageShell wide>
          <div className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-6 shadow-card">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/12 text-2xl font-extrabold text-primary">
                {profile.full_name?.charAt(0) ?? "و"}
              </div>
              <div>
                <h1 className="text-xl font-extrabold">{profile.full_name}</h1>
                <p className="text-sm text-muted-foreground">طلب</p>
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="size-4 shrink-0 text-primary" />
                <span className="truncate">{profile.email}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Hash className="size-4 shrink-0 text-primary" />
                <span>الكود: {profile.code}</span>
              </div>
            </div>
            <div className="mt-6">
              <LogoutButton />
            </div>
          </div>
        </PageShell>
        <AppNav role="student" />
      </>
    );
  }

  const data = await loadStudentDashboard(profile.id);
  const rows = data.rows;
  const unreadCount = data.unreadCount;
  const chatActive = new Set(data.chatActivityIds);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const statusOf = new Map<string, StudentStatusKey>();
  for (const r of rows) {
    const grade = r.grades?.grade;
    statusOf.set(
      r.id,
      computeAssignmentStatus({
        role: "student",
        status: r.status,
        closedBy: r.closed_by,
        hasGrade: grade !== undefined && grade !== null,
        hasSubmission: (r.submissions?.[0]?.count ?? 0) > 0,
        hasStudentMessage: chatActive.has(r.id),
        dueAt: r.assignment?.due_at ?? null,
        nowMs
      }) as StudentStatusKey
    );
  }

  const groups: {
    key: StudentStatusKey;
    rows: Row[];
    accent: string;
  }[] = STUDENT_STATUSES.map((key) => ({
    key,
    rows: rows.filter((r) => statusOf.get(r.id) === key),
    accent: GROUP_ACCENT[key]
  }));

  const actionables = rows.filter((r) => {
    const k = statusOf.get(r.id);
    return k === "not_submitted" || k === "under_review";
  }).length;

  const firstName = (profile.full_name ?? "").trim().split(/\s+/).slice(0, 2).join(" ");

  return (
    <NotificationGate>
      <>
        <PageShell wide>
          {/* Header */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-lg font-extrabold text-primary">
                {profile.full_name?.charAt(0) ?? "و"}
              </div>
              <div>
                <h1 className="font-amiri text-2xl font-bold leading-tight">أهلًا {firstName}</h1>
                <p className="text-sm text-muted-foreground">احفظ وسمع كوس يا بطل</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <NotificationBell userId={profile.id} initialUnread={unreadCount ?? 0} />
            </div>
          </header>

          {/* Action-oriented summary */}
          <section className="relative mb-6 overflow-hidden rounded-[var(--radius-lg)] bg-primary p-5 text-primary-foreground shadow-raise">
            <div aria-hidden className="pointer-events-none absolute -start-8 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -end-10 -bottom-14 size-48 rounded-full bg-cyan/20 blur-2xl" />
            <div className="relative">
              <p className="text-lg font-extrabold leading-snug">
                {actionables === 0
                  ? "كل واجباتك تمام ، برافو"
                  : `عندك ${actionables} واجب محتاج منك شغل`}
              </p>
              <p className="mt-0.5 text-xs text-primary-foreground/80">
                اضغط على الواجب للدخول عليه وتصليح المطلوب
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {groups.slice(0, 4).map((g) => (
                  <a
                    key={g.key}
                    href={`#${g.key}`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/20"
                  >
                    <span className="text-sm font-semibold">{STATUS_TITLES[g.key]}</span>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-primary">
                      {g.rows.length}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>

          {/* Grouped assignment lists */}
          {groups.map((g) =>
            g.rows.length === 0 ? null : (
              <section key={g.key} id={g.key} className="mb-6 scroll-mt-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className={`size-2 rounded-full ${g.accent.split(" ")[0]}`} style={{ background: "currentColor" }} />
                  <h2 className="text-[var(--text-h2)] font-bold">{STATUS_TITLES[g.key]}</h2>
                  <span className="text-sm text-muted-foreground">({g.rows.length})</span>
                </div>
                <div className="grid gap-2.5">
                  {g.rows.map((r) => (
                    <AssignmentItem key={r.id} href={`/student/assignments/${r.id}`} row={r} accent={g.accent} statusKey={g.key} />
                  ))}
                </div>
              </section>
            )
          )}

          {rows.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10 text-center">
              <Home className="mx-auto mb-3 size-10 text-primary/40" />
              <p className="font-semibold text-foreground">مفيش واجبات محتاجة منك حاجة دلوقتي 🎉</p>
              <p className="mt-1 text-sm text-muted-foreground">حس تلاقي الواجبات هنا أول ما ينزلونها.</p>
            </div>
          ) : null}
        </PageShell>
        <AppNav role="student" />
      </>
    </NotificationGate>
  );
}