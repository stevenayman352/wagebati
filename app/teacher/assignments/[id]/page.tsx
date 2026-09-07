import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, GraduationCap, ChevronUp } from "lucide-react";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  computeAssignmentStatus,
  conversationHasActivity,
  type TeacherStatusKey
} from "@/lib/assignment-status";
import { StatusPill, statusVisual } from "@/components/status-chip";

type ConversationRow = {
  id: string;
  status: string;
  closed_by: string | null;
  last_message_at: string | null;
  student?: { full_name: string; code: number } | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
};

export default async function TeacherAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [assignmentRes, conversationsRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, max_grade, due_at, status, classes!inner(name, id)")
      .eq("id", id)
      .single(),
    supabase
      .from("conversations")
      .select(
        "id, status, closed_by, last_message_at, student:profiles!conversations_student_id_fkey(full_name, code), grades(grade), submissions(count)"
      )
      .eq("assignment_id", id)
      .order("updated_at", { ascending: false })
  ]);
  const assignmentData = assignmentRes.data;
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

  const rows = (conversationsRes.data ?? []) as unknown as ConversationRow[];
  const conversationIds = rows.map((r) => r.id);

  const [chatActive, subsRes] = await Promise.all([
    fetchStudentChatActivity(supabase, conversationIds),
    conversationIds.length
      ? supabase.from("submissions").select("conversation_id").in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] })
  ]);
  const hasSubmission = new Set((subsRes.data ?? []).map((s) => s.conversation_id as string));

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const maxGrade = assignment.max_grade ?? 20;

  const withStatus = rows.map((c) => {
    const grade = c.grades?.grade;
    const statusKey = computeAssignmentStatus({
      role: "teacher",
      status: c.status,
      closedBy: c.closed_by,
      hasGrade: grade !== undefined && grade !== null,
      hasSubmission: hasSubmission.has(c.id) || (c.submissions?.[0]?.count ?? 0) > 0,
      hasStudentMessage: chatActive.has(c.id),
      dueAt: assignment.due_at,
      nowMs
    }) as TeacherStatusKey;
    return { ...c, grade: grade ?? null, statusKey };
  });

  const submitted = withStatus.filter((c) => conversationHasActivity({ hasGrade: c.grade !== null, hasSubmission: hasSubmission.has(c.id) || (c.submissions?.[0]?.count ?? 0) > 0, hasStudentMessage: chatActive.has(c.id) }));

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
            ({withStatus.length}) · سلموا {submitted.length}
          </span>
        </h2>

        <div className="grid gap-2">
          {withStatus.map((c) => {
            const { Icon, cls } = statusVisual(c.statusKey);
            return (
              <Link
                key={c.id}
                href={`/teacher/conversations/${c.id}`}
                className="flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
              >
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cls}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold">{c.student?.full_name ?? "طالب"}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">الكود: {c.student?.code ?? ""}</div>
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
          {withStatus.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              لا يوجد طلاب مرتبطون بهذا الواجب بعد.
            </p>
          ) : null}
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}