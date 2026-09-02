import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ClipboardList, FileText, ChevronUp } from "lucide-react";

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
  status: string;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
};

export default async function TeacherAssignmentsPage() {
  const profile = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  let classIds: string[] | null = null;
  if (profile.role !== "admin") {
    const { data } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", profile.id);
    classIds = data?.map((c) => c.class_id as string) ?? [];
  }

  let assignmentQuery = supabase
    .from("assignments")
    .select(
      "id, title, due_at, max_grade, status, classes!inner(name), conversations(id, status, grades(grade), submissions(count))"
    )
    .order("created_at", { ascending: false });
  if (classIds)
    assignmentQuery = assignmentQuery.in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: raw, error } = await assignmentQuery;
  if (error) notFound();

  const rows = (raw ?? []) as unknown as AssignmentRow[];

  const hasSubmitted = (c: ConversationElement) => {
    const subs = c.submissions as { count?: number }[] | null | undefined;
    const subCount = Array.isArray(subs) ? (subs[0]?.count ?? 0) : 0;
    const graded = c.grades?.grade !== undefined && c.grades?.grade !== null;
    return c.status === "closed" || graded || subCount > 0;
  };

  const formatDue = (due: string | null) => {
    if (!due) return "بدون موعد";
    return new Date(due).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
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
              <h1 className="text-[var(--text-h1)] font-extrabold">الواجبات</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">تابع تسليمات طلابك لكل واجب</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/teacher" className="gap-1">
              <ArrowLeft className="size-4" />
              رجوع
            </Link>
          </Button>
        </header>

        <div className="grid gap-2.5">
          {rows.map((a) => {
            const submittedCount = (a.conversations ?? []).filter(hasSubmitted).length;
            const isDraft = a.status === "draft";
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
                      <Badge variant={isDraft ? "secondary" : "success"}>{isDraft ? "مسودة" : "منشور"}</Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.classes?.name ? `فصل ${a.classes.name}` : "بدون صف"}
                    </div>
                    <div className="text-xs text-muted-foreground">الدرجة: {a.max_grade} من {a.max_grade}</div>
                    <div className="text-xs text-muted-foreground">التسليم: {formatDue(a.due_at)}</div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                      {submittedCount} طالب سلموا
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
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}