import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/page-shell";
import { AssignmentItem } from "@/components/assignment-item";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Home, Mail, Hash, ShieldCheck } from "lucide-react";

type Row = {
  id: string;
  status: string;
  needs_revision: boolean;
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

export default async function StudentPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireRole(["student"]);
  const { tab } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: raw } = await supabase
    .from("conversations")
    .select(
      "id, status, needs_revision, closed_at, grades(grade), submissions(count), assignment:assignments!inner(title, due_at, max_grade, status, classes!inner(name))"
    )
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const rows = (raw ?? []) as unknown as Row[];

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
              <div className="flex items-center gap-3 text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary" />
                <span>الدور: طالب</span>
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

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const hasSub = (r: Row) => (r.submissions?.[0]?.count ?? 0) > 0;
  const isGraded = (r: Row) => r.grades?.grade !== undefined && r.grades?.grade !== null;
  const duePassed = (r: Row) => {
    const due = r.assignment?.due_at ? new Date(r.assignment.due_at).getTime() : null;
    return due !== null && due < nowMs;
  };
  const overdue = (r: Row) => !hasSub(r) && duePassed(r) && r.status !== "closed";

  const needsRevision = rows.filter((r) => r.status === "active" && r.needs_revision);
  const pending = rows.filter((r) => !hasSub(r) && r.status === "active" && !r.needs_revision && !overdue(r));
  const overdueRows = rows.filter(overdue);
  const underReview = rows.filter((r) => hasSub(r) && r.status === "active" && !isGraded(r) && !r.needs_revision);
  const completed = rows.filter((r) => r.status === "closed" || isGraded(r));

  const firstName = (profile.full_name ?? "").trim().split(/\s+/).slice(0, 2).join(" ");

  const groups: { key: string; title: string; empty: string; rows: Row[]; accent: string }[] = [
    {
      key: "revision",
      title: "يحتاج تعديل",
      empty: "لا توجد واجبات تحتاج تعديل 🎉",
      rows: needsRevision,
      accent: "text-warning bg-warning/12 border-warning/25"
    },
    {
      key: "overdue",
      title: "فات موعده",
      empty: "لا توجد واجبات متأخرة",
      rows: overdueRows,
      accent: "text-destructive bg-destructive/10 border-destructive/20"
    },
    {
      key: "pending",
      title: "بانتظار الإرسال",
      empty: "لا توجد واجبات بانتظار الإرسال",
      rows: pending,
      accent: "text-primary bg-primary/10 border-primary/20"
    },
    {
      key: "underReview",
      title: "قيد المراجعة",
      empty: "لا توجد واجبات قيد المراجعة",
      rows: underReview,
      accent: "text-muted-foreground bg-muted border-border"
    },
    {
      key: "completed",
      title: "مكتملة",
      empty: "لا توجد واجبات مكتملة بعد",
      rows: completed,
      accent: "text-success bg-success/12 border-success/20"
    }
  ];

  const totalActionable =
    needsRevision.length + overdueRows.length + pending.length + underReview.length;

  return (
    <>
      <PageShell wide>
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-lg font-extrabold text-primary">
              {profile.full_name?.charAt(0) ?? "و"}
            </div>
            <div>
              <h1 className="font-amiri text-2xl font-bold leading-tight">أهلًا {firstName} 👋</h1>
              <p className="text-sm text-muted-foreground">هذي واجباتك اللي محتاجة منك خطوة</p>
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
              {totalActionable === 0
                ? "كل شيء تمام، ما عندك مهام مستعجلة 🎉"
                : `عندك ${totalActionable} واجبات محتاجة منك خطوة`}
            </p>
            <p className="mt-0.5 text-xs text-primary-foreground/80">
              اضغط على الواجب للدخول عليه وتصليح اللي مطلوب
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {groups.slice(0, 4).map((g) => (
                <a
                  key={g.key}
                  href={`#${g.key}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <span className="text-sm font-semibold">{g.title}</span>
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
                <h2 className="text-[var(--text-h2)] font-bold">{g.title}</h2>
                <span className="text-sm text-muted-foreground">({g.rows.length})</span>
              </div>
              <div className="grid gap-2.5">
                {g.rows.map((r) => (
                  <AssignmentItem key={r.id} href={`/student/assignments/${r.id}`} row={r} accent={g.accent} />
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
  );
}
