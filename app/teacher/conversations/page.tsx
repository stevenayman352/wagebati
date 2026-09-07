import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchStudentChatActivity } from "@/lib/assignment-activity";
import {
  computeAssignmentStatus,
  isTeacherStatusKey,
  STATUS_LABEL,
  TEACHER_STATUSES,
  type TeacherStatusKey
} from "@/lib/assignment-status";
import { ConversationList, type ConversationSection } from "@/components/conversation-list";

const PILLS: { key: TeacherStatusKey | "all"; label: string }[] = [
  { key: "all", label: "الكل" },
  ...TEACHER_STATUSES.map((key) => ({ key, label: STATUS_LABEL[key] }))
];

export default async function TeacherConversationsPage({
  searchParams
}: {
  searchParams: Promise<{ assignment?: string; status?: string }>;
}) {
  const profile = await requireRole(["teacher", "admin"]);
  const { assignment, status } = await searchParams;
  const activeFilter: TeacherStatusKey | "all" =
    status !== undefined && isTeacherStatusKey(status) ? status : "all";
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("conversations")
    .select(
      "id, status, closed_by, last_message_at, student:profiles!conversations_student_id_fkey(full_name, code), assignment:assignments!inner(title, id, due_at, classes!inner(name, id))"
    )
    .order("last_message_at", { ascending: false });

  if (assignment) query = query.eq("assignment_id", assignment);

  const [convRes, teacherClassIds, unreadRes] = await Promise.all([
    query,
    (async () => {
      if (profile.role === "admin") {
        const { data } = await supabase.from("classes").select("id");
        return data?.map((c) => c.id) ?? [];
      }
      const { data } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", profile.id);
      return data?.map((c) => c.class_id as string) ?? [];
    })(),
    supabase.rpc("unread_messages_for")
  ]);
  const conversations = convRes.data;
  const unreadRows = unreadRes.data;
  const unread = new Map<string, number>();
  for (const row of unreadRows ?? []) unread.set(row.conversation_id, row.unread_count);

  const raw = (conversations ?? []).filter((c) => {
    const a = c.assignment as unknown as { classes?: { id: string } | null } | null;
    return a?.classes ? teacherClassIds.includes(a.classes.id) : false;
  }) as unknown as {
    id: string;
    status: string;
    closed_by: string | null;
    last_message_at: string | null;
    student?: { full_name: string; code: string } | null;
    assignment?: {
      title: string;
      due_at: string | null;
      classes?: { name: string; id: string } | null;
    } | null;
  }[];

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const conversationIds = raw.map((c) => c.id);

  const [subsRes, gradesRes, chatActive] = await Promise.all([
    conversationIds.length
      ? supabase
          .from("submissions")
          .select("conversation_id")
          .in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] }),
    conversationIds.length
      ? supabase.from("grades").select("conversation_id").in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] }),
    fetchStudentChatActivity(supabase, conversationIds)
  ]);

  const anySubmitted = new Set((subsRes.data ?? []).map((s) => s.conversation_id as string));
  const graded = new Set((gradesRes.data ?? []).map((g) => g.conversation_id as string));

  const statuses = new Map<string, TeacherStatusKey>();
  for (const c of raw) {
    statuses.set(
      c.id,
      computeAssignmentStatus({
        role: "teacher",
        status: c.status,
        closedBy: c.closed_by,
        hasGrade: graded.has(c.id),
        hasSubmission: anySubmitted.has(c.id),
        hasStudentMessage: chatActive.has(c.id),
        dueAt: c.assignment?.due_at ?? null,
        nowMs
      }) as TeacherStatusKey
    );
  }

  const filtered = raw.filter((c) => activeFilter === "all" || statuses.get(c.id) === activeFilter);

  const grouped = new Map<string, typeof filtered>();
  for (const c of filtered) {
    const key = c.assignment?.classes?.name || "صف غير معروف";
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }
  const sections: ConversationSection[] = Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ar"))
    .map(([name, rows]) => ({
      name,
      rows: rows.map((c) => ({
        id: c.id,
        href: `/teacher/conversations/${c.id}`,
        title: c.assignment?.title ?? "",
        name: c.student?.full_name ?? null,
        code: c.student?.code ?? null,
        statusKey: statuses.get(c.id)!,
        unread: unread.get(c.id) ?? 0,
        lastAt: c.last_message_at
      }))
    }));

  const emptyText =
    activeFilter === "all"
      ? "لا توجد محادثات بعد."
      : `لا توجد واجبات بحالة «${STATUS_LABEL[activeFilter]}».`;

  return (
    <>
      <PageShell>
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[var(--text-h1)] font-extrabold">المحادثات</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {PILLS.find((p) => p.key === activeFilter)?.label}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/teacher" className="gap-1">
                <ArrowLeft className="size-4" />
                رجوع
              </Link>
            </Button>
          </div>
        </header>

        {/* Filter pills */}
        <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {PILLS.map((p) => (
            <Link
              key={p.key}
              href={`/teacher/conversations${p.key === "all" ? "" : `?status=${p.key}`}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                activeFilter === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <ConversationList sections={sections} emptyText={emptyText} />
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}