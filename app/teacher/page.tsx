import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAssignmentAction,
  deleteAssignmentAction,
  publishAssignmentAction
} from "@/app/actions/teacher";
import { NotificationBell } from "@/components/notification-bell";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckCircle2, Plus, RefreshCw, Users, FileText, Paperclip, Mail, Hash, ShieldCheck, Hourglass, ClipboardCheck } from "lucide-react";

type Row = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  max_grade: number;
  status: string;
  published_at: string | null;
  created_at: string;
  classes?: { name?: string } | null;
  assignment_attachments?: { count: number }[] | null;
};

function formatDate(value: string | null) {
  if (!value) return "بدون موعد";
  const d = new Date(value);
  return d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default async function TeacherPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireRole(["teacher", "admin"]);
  const { tab } = await searchParams;
  const supabase = await createSupabaseServerClient();

  if (tab === "account") {
    return (
      <>
        <PageShell wide>
          <div className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-6 shadow-card">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/12 text-2xl font-extrabold text-primary">
                {profile.full_name?.charAt(0) ?? "م"}
              </div>
              <div>
                <h1 className="text-xl font-extrabold">{profile.full_name}</h1>
                <p className="text-sm text-muted-foreground">مُدرّس</p>
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
                <span>الدور: {profile.role === "admin" ? "إدارة" : "مُدرّس"}</span>
              </div>
            </div>
            <div className="mt-6">
              <LogoutButton />
            </div>
          </div>
        </PageShell>
        <AppNav role="teacher" />
      </>
    );
  }

  const { data: myClasses } = await supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", profile.id);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const classIds = profile.role === "admin"
    ? null
    : (myClasses ?? []).map((r) => r.class_id as string);

  let classesQuery = supabase.from("classes").select("id, name, grade_label").order("name");
  if (classIds) classesQuery = classesQuery.in("id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: classes } = await classesQuery;

  let assignmentsQuery = supabase
    .from("assignments")
    .select(
      "id, title, instructions, due_at, max_grade, status, published_at, created_at, classes!inner(name), assignment_attachments(count)"
    )
    .order("created_at", { ascending: false });
  if (classIds) assignmentsQuery = assignmentsQuery.in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: raw } = await assignmentsQuery;
  const rows = (raw ?? []) as unknown as Row[];

  const drafts = rows.filter((r) => r.status === "draft");
  const published = rows.filter((r) => r.status === "published");

  const inScope = classIds
    ? (ids: string[]) => ids.some((id) => (classIds as string[]).includes(id))
    : () => true;

  const [convRes, enrollRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, status, needs_revision, assignment:assignments!inner(due_at, class_id)")
      .eq("status", "active"),
    supabase.from("class_students").select("class_id, student_id")
  ]);
  const conversations = (convRes.data ?? []).filter((c) => {
    const a = c.assignment as unknown as { class_id?: string } | null;
    return a?.class_id ? inScope([a.class_id]) : false;
  });
  const conversationIds = conversations.map((c) => c.id as string);

  // eslint-disable-next-line react-hooks/purity
  const cutoffIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentSubs } = conversationIds.length
    ? await supabase
        .from("submissions")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .gte("submitted_at", cutoffIso)
    : { data: [] };
  const recentlySubmitted = new Set((recentSubs ?? []).map((s) => s.conversation_id as string));

  const [allSubs, allGrades] = conversationIds.length
    ? await Promise.all([
        supabase.from("submissions").select("conversation_id").in("conversation_id", conversationIds),
        supabase.from("grades").select("conversation_id").in("conversation_id", conversationIds)
      ])
    : [{ data: [] }, { data: [] }];
  const submittedIds = new Set((allSubs.data ?? []).map((s) => s.conversation_id as string));
  const gradedIds = new Set((allGrades.data ?? []).map((g) => g.conversation_id as string));

  const toReview = conversations.filter(
    (c) => c.status === "active" && !c.needs_revision && submittedIds.has(c.id) && !gradedIds.has(c.id)
  ).length;
  const needsRevision = conversations.filter((c) => c.needs_revision === true).length;
  const notSubmitted = conversations.filter((c) => c.status === "active" && !submittedIds.has(c.id)).length;
  const sentRecently = recentlySubmitted.size;

  const studentCounts = new Map<string, number>();
  for (const e of enrollRes.data ?? []) {
    studentCounts.set(e.class_id as string, (studentCounts.get(e.class_id as string) ?? 0) + 1);
  }

  const metrics = [
    { href: "/teacher/conversations?filter=review", count: toReview, label: "قيد المراجعة", icon: ClipboardCheck, tone: "text-primary bg-primary/10" },
    { href: "/teacher/conversations?filter=revision", count: needsRevision, label: "مطلوب تعديل", icon: RefreshCw, tone: "text-warning bg-warning/12" },
    { href: "/teacher/conversations?filter=notsubmitted", count: notSubmitted, label: "لم يتم التسليم", icon: Hourglass, tone: "text-destructive bg-destructive/10" },
    { href: "/teacher/conversations?filter=recent", count: sentRecently, label: "تم التسليم (7 أيام)", icon: CheckCircle2, tone: "text-success bg-success/12" }
  ];

  return (
    <>
      <PageShell wide>
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-amiri text-[var(--text-h1)] font-bold">أهلًا {profile.full_name?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "بك"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">تقدّم طلابك في لمحة</p>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell userId={profile.id} initialUnread={unreadCount ?? 0} />
          </div>
        </header>

        {/* Metrics */}
        <section className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.href}
                href={m.href}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raise active:translate-y-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${m.tone}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="text-[1.7rem] font-extrabold leading-none">{m.count}</span>
                </div>
                <p className="mt-2.5 text-xs font-semibold text-muted-foreground">{m.label}</p>
              </Link>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column: assignments */}
          <div className="lg:col-span-2">
            <section className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/12">
                  <FileText className="size-3.5 text-primary" />
                </span>
                <h2 className="text-[var(--text-h2)] font-bold">الواجبات</h2>
              </div>
              <div className="grid gap-2.5">
                {[...drafts, ...published].map((a) => {
                  const isDraft = a.status === "draft";
                  return (
                    <div key={a.id} className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-base font-bold">{a.title}</span>
                            <Badge variant={isDraft ? "secondary" : "success"}>
                              {isDraft ? "مسودة" : "منشور"}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{a.classes?.name}</span>
                            {a.assignment_attachments?.[0]?.count ? (
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="size-3" /> {a.assignment_attachments[0].count}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-left text-xs text-muted-foreground">
                          التسليم: {formatDate(a.due_at)}<br />
                          الدرجة:{a.max_grade}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/teacher/assignments/${a.id}/edit`}>تعديل</Link>
                        </Button>
                        {isDraft ? (
                          <>
                            <form action={publishAssignmentAction}>
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <Button type="submit" size="sm">نشر للصف</Button>
                            </form>
                            <form action={deleteAssignmentAction}>
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <Button type="submit" variant="destructive" size="sm">حذف</Button>
                            </form>
                          </>
                        ) : (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/teacher/conversations?assignment=${a.id}`}>متابعة المحادثات</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(drafts.length + published.length) === 0 ? (
                  <p className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
                    لا توجد واجبات بعد. أنشئ أول واجب من الأسفل.
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          {/* Side column: classes + new assignment */}
          <div className="space-y-6">
            <section className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <h2 className="font-bold">الصفوف</h2>
                </div>
                <Badge variant="secondary">{(classes ?? []).length}</Badge>
              </div>
              <div className="grid gap-2">
                {(classes ?? []).map((c) => (
                  <Link key={c.id} href={`/teacher/classes/${c.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40">
                    <span className="text-sm font-medium">فصل {c.name}</span>
                    <Badge variant="secondary">{studentCounts.get(c.id) ?? 0} طالب</Badge>
                  </Link>
                ))}
                {(classes ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد صفوف.</p> : null}
              </div>
            </section>
          </div>
        </div>

        {/* New assignment */}
        <section className="rounded-[var(--radius-lg)] border border-primary/20 bg-primary/[0.03] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="size-3.5" />
            </span>
            <h2 className="text-[var(--text-h2)] font-bold">واجب جديد</h2>
          </div>
          {classIds !== null && classes?.length === 0 ? (
            <p className="text-sm text-destructive">لم تُربط بأي صف بعد. اطلب من الإدارة ربطك بصنف.</p>
          ) : (
            <ActionForm action={createAssignmentAction} className="grid gap-4 md:grid-cols-2" submitLabel="نشر الواجب">
              <div className="grid gap-1.5">
                <Label htmlFor="classId">الصف</Label>
                <select id="classId" name="classId" className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm" required>
                  {(classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="title">عنوان الواجب</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="instructions">التعليمات</Label>
                <textarea id="instructions" name="instructions" className="min-h-24 rounded-lg border border-border bg-background p-2.5 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dueDate">تاريخ التسليم</Label>
                <Input id="dueDate" name="dueDate" type="date" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dueTime">وقت التسليم</Label>
                <Input id="dueTime" name="dueTime" type="time" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="maxGrade">الدرجة العظمى</Label>
                <Input id="maxGrade" name="maxGrade" type="number" min="0.5" max="1000" step="0.5" defaultValue="20" />
              </div>
            </ActionForm>
          )}
        </section>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
