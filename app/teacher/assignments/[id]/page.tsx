import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, GraduationCap, FileText, ChevronUp, CheckCircle2, Clock3, RefreshCw } from "lucide-react";

type ConversationRow = {
  id: string;
  status: string;
  needs_revision: boolean;
  last_message_at: string | null;
  student?: { full_name: string; code: number } | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
};

export default async function TeacherAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select("id, title, max_grade, due_at, status, classes!inner(name, id)")
    .eq("id", id)
    .single();
  if (!assignmentData) notFound();
  const assignment = assignmentData as unknown as {
    id: string;
    title: string;
    max_grade: number;
    due_at: string | null;
    status: string;
    classes?: { name: string; id: string } | null;
  };

  const isAdmin = profile.role === "admin";
  if (!isAdmin) {
    const classId = assignment.classes?.id;
    const { data: taught } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("class_id", classId ?? "")
      .eq("teacher_id", profile.id);
    if (!classId || !(taught ?? []).length) notFound();
  }

  const { data: conversationsData } = await supabase
    .from("conversations")
    .select(
      "id, status, needs_revision, last_message_at, student:profiles!conversations_student_id_fkey(full_name, code), grades(grade), submissions(count)"
    )
    .eq("assignment_id", id)
    .order("updated_at", { ascending: false });

  const rows = (conversationsData ?? []) as unknown as ConversationRow[];

  const hasSubmitted = (c: ConversationRow) => {
    const subs = c.submissions as { count?: number }[] | null | undefined;
    const subCount = Array.isArray(subs) ? (subs[0]?.count ?? 0) : 0;
    const graded = c.grades?.grade !== undefined && c.grades?.grade !== null;
    return c.status === "closed" || graded || subCount > 0;
  };
  const submitted = rows.filter(hasSubmitted);
  const maxGrade = assignment.max_grade ?? 20;

  const gradeOf = (c: ConversationRow) => (c.grades?.grade !== undefined && c.grades?.grade !== null ? c.grades.grade : null);

  return (
    <>
      <PageShell>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-mx-2 text-muted-foreground">
            <Link href="/teacher/assignments" className="gap-1.5">
              <ArrowLeft className="size-4" />
              الواجبات
            </Link>
          </Button>
        </div>

        <header className="mb-6 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12">
            <FileText className="size-6 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[var(--text-h1)] font-extrabold">{assignment.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {assignment.classes?.name ? `فصل ${assignment.classes.name} · ` : ""}
              {maxGrade} درجة
            </p>
          </div>
        </header>

        <h2 className="mb-2.5 flex items-center gap-2 font-bold">
          <GraduationCap className="size-4 text-primary" />
          الطلاب الذين سلموا
          <span className="text-sm font-normal text-muted-foreground">({submitted.length})</span>
        </h2>

        <div className="grid gap-2">
          {submitted.map((c) => {
            const isRevision = c.needs_revision && c.status !== "closed";
            const isClosed = c.status === "closed";
            const grade = gradeOf(c);
            return (
              <Link
                key={c.id}
                href={`/teacher/conversations/${c.id}`}
                className="flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    isRevision ? "bg-warning/15 text-warning" : isClosed ? "bg-success/12 text-success" : "bg-primary/10 text-primary"
                  }`}
                >
                  {isRevision ? (
                    <RefreshCw className="size-4" />
                  ) : isClosed ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Clock3 className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{c.student?.full_name ?? "طالب"}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>الكود: {c.student?.code ?? ""}</span>
                    <Badge variant={isRevision ? "warning" : isClosed ? "secondary" : "outline"}>
                      {isRevision ? "مراجعة" : isClosed ? "مكتمل" : "قيد المراجعة"}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {grade !== null ? (
                    <Badge className="bg-success/10 text-success">
                      {grade} / {maxGrade}
                    </Badge>
                  ) : (
                    <Badge variant="outline">بانتظار التقييم</Badge>
                  )}
                  <ChevronUp className="size-4 rotate-180 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
          {submitted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              لم يسلّم أي طالب هذا الواجب بعد.
            </p>
          ) : null}
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}