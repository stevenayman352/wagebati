import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { ArrowLeft, GraduationCap, ChevronUp, FileText, RefreshCw, CheckCircle2 } from "lucide-react";

function fmt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}

export default async function TeacherStudentPage({
  params
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id: classId, studentId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: klass } = await supabase.from("classes").select("id, name").eq("id", classId).single();
  if (!klass) notFound();

  const { data: student } = await supabase
    .from("profiles")
    .select("full_name, code, role")
    .eq("id", studentId)
    .single();
  if (!student || student.role !== "student") notFound();

  const { data: conversationsData } = await supabase
    .from("conversations")
    .select(
      "id, status, needs_revision, last_message_at, grades(grade, comment), assignment:assignments!inner(title, max_grade, class_id)"
    )
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });

  const rows = (conversationsData ?? []).filter((conv) => {
    const a = conv.assignment as unknown as { class_id?: string } | null;
    return a?.class_id === classId;
  }) as unknown as {
    id: string;
    status: string;
    needs_revision: boolean;
    last_message_at: string | null;
    grades?: { grade: number; comment: string | null } | null;
    assignment?: { title: string; max_grade: number; class_id?: string } | null;
  }[];

  return (
    <>
      <PageShell>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-mx-2 text-muted-foreground">
            <Link href={`/teacher/classes/${classId}`} className="gap-1.5">
              <ArrowLeft className="size-4" />
              رجوع
            </Link>
          </Button>
        </div>

        <header className="mb-6 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12">
            <GraduationCap className="size-6 text-primary" />
          </span>
          <div>
            <h1 className="text-[var(--text-h1)] font-extrabold">{student.full_name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {student.code} · فصل {klass.name}
            </p>
          </div>
        </header>

        <h2 className="mb-2.5 flex items-center gap-2 font-bold">
          <FileText className="size-4 text-primary" />
          سجل الطالب
          <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </h2>

        <div className="grid gap-2">
          {rows.map((c) => {
            const isRevision = c.needs_revision && c.status === "active";
            return (
              <Link
                key={c.id}
                href={`/teacher/conversations/${c.id}`}
                className="flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-raise"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    isRevision ? "bg-warning/15 text-warning" : c.status === "closed" ? "bg-success/12 text-success" : "bg-primary/10 text-primary"
                  }`}
                >
                  {isRevision ? <RefreshCw className="size-4" /> : c.status === "closed" ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{c.assignment?.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{fmt(c.last_message_at)}</div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {isRevision ? <Badge variant="warning">مراجعة</Badge> : null}
                  {c.status === "closed" ? <Badge variant="secondary">مكتمل</Badge> : <Badge variant="success">جارٍ</Badge>}
                  {c.grades?.grade !== undefined && c.grades?.grade !== null ? (
                    <Badge variant="outline">
                      {c.grades.grade} / {c.assignment?.max_grade ?? ""}
                    </Badge>
                  ) : null}
                </div>
                <ChevronUp className="size-4 rotate-180 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              لا توجد محادثات لهذا الطالب في هذا الفصل.
            </p>
          ) : null}
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
