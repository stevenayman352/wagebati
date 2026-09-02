import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StudentSearch } from "@/components/student-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { FileText, ArrowLeft, Users, GraduationCap, ChevronUp, Download } from "lucide-react";

export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, grade_label")
    .eq("id", id)
    .single();
  if (!klass) notFound();

  const { data: teachersData } = await supabase
    .from("class_teachers")
    .select("teacher:profiles!class_teachers_teacher_id_fkey(full_name)")
    .eq("class_id", id);

  const { data: studentsData } = await supabase
    .from("class_students")
    .select("student_id, students:profiles!class_students_student_id_fkey(full_name, code)")
    .eq("class_id", id);

  const { data: assignmentsData } = await supabase
    .from("assignments")
    .select("id, title, status, due_at, max_grade")
    .eq("class_id", id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const klassFull = klass as unknown as { name: string; grade_label: string };
  const teacherNames = (teachersData ?? [])
    .map((t) => (t.teacher as unknown as { full_name: string } | null)?.full_name ?? "-")
    .filter((n) => n !== "-");
  const students = (studentsData ?? []) as unknown as { student_id: string; students?: { full_name: string; code: string } | null }[];
  const assignments = (assignmentsData ?? []) as unknown as { id: string; title: string; status: string; due_at: string | null; max_grade: number }[];

  return (
    <>
      <PageShell wide>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-mx-2 text-muted-foreground">
            <Link href="/teacher/classes" className="gap-1.5">
              <ArrowLeft className="size-4" />
              الفصول
            </Link>
          </Button>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export?target=class&format=xlsx&id=${id}`} className="gap-1.5">
                <Download className="size-3.5" />
                إكسل
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export?target=class&format=pdf&id=${id}`}>PDF</a>
            </Button>
          </div>
        </div>

        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12">
              <GraduationCap className="size-6 text-primary" />
            </span>
            <div>
              <h1 className="text-[var(--text-h1)] font-extrabold">فصل {klassFull.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {klassFull.grade_label || "—"}
                {teacherNames.length ? ` · المدرس: ${teacherNames.join("، ")}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:max-w-sm">
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-card">
              <Users className="size-4 text-primary" />
              <div>
                <div className="text-lg font-extrabold leading-none">{students.length}</div>
                <div className="text-xs text-muted-foreground">طالب</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-card">
              <FileText className="size-4 text-primary" />
              <div>
                <div className="text-lg font-extrabold leading-none">{assignments.length}</div>
                <div className="text-xs text-muted-foreground">واجب منشور</div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Users className="size-4 text-primary" />
              الطلاب
              <span className="text-sm font-normal text-muted-foreground">({students.length})</span>
            </h2>
            <StudentSearch>
              {students.map((s) => (
                <Link
                  key={s.student_id}
                  href={`/teacher/classes/${id}/students/${s.student_id}`}
                  data-name={s.students?.full_name ?? ""}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {s.students?.full_name?.charAt(0) ?? "ط"}
                    </span>
                    <span className="font-medium">{s.students?.full_name ?? "طالب"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{s.students?.code ?? ""}</span>
                    <ChevronUp className="size-3.5 rotate-180 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </StudentSearch>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <FileText className="size-4 text-primary" />
              الواجبات المنشورة
              <span className="text-sm font-normal text-muted-foreground">({assignments.length})</span>
            </h2>
            <div className="grid gap-2">
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/teacher/conversations?assignment=${a.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="size-4 text-primary" />
                    </span>
                    <span className="font-medium">{a.title}</span>
                  </div>
                  <Badge variant="secondary">{a.max_grade} درجة</Badge>
                </Link>
              ))}
              {assignments.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">لا توجد واجبات منشورة بعد.</p>
              ) : null}
            </div>
          </section>
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
