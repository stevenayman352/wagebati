import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";
import type { ThreadMessage } from "@/components/conversation-thread";
import { ConfirmClose } from "@/components/confirm-close";
import { ReopenConversation } from "@/components/reopen-conversation";
import { GradeAutosave } from "@/components/grade-autosave";
import { LiveGradeRefresh } from "@/components/live-grade-refresh";
import { AppNav } from "@/components/app-nav";
import { BackButton } from "@/components/back-button";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDueDate } from "@/components/due-date-card";
import { CalendarDays, UserRound } from "lucide-react";
import { computeAssignmentStatus, type TeacherStatusKey } from "@/lib/assignment-status";
import { StatusPill } from "@/components/status-chip";

export default async function TeacherConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

const [conversationRes, messagesRes] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, status, closed_by, closed_at, grades(grade), submissions(count), student:profiles!conversations_student_id_fkey(full_name, code), assignment:assignments!inner(title, due_at, max_grade)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, storage_path, file_name, mime_type, file_size, duration_seconds, reply_to_message_id, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .limit(1000)
  ]);
  const conversation = conversationRes.data;
  if (!conversation) notFound();

  const conv = conversation as unknown as {
    id: string;
    status: string;
    closed_by: string | null;
    closed_at: string | null;
    grades?: { grade: number } | null;
    submissions?: { count: number }[] | null;
    student?: { full_name: string; code: string } | null;
    assignment?: { title: string; due_at: string | null; max_grade: number } | null;
  };

  const messages = (messagesRes.data ?? []) as unknown as ThreadMessage[];

  const mediaMessages = messages.filter((m): m is ThreadMessage & { storage_path: string } => Boolean(m.storage_path));
  const signedUrls = mediaMessages.length
    ? await supabase.storage
        .from("message-media")
        .createSignedUrls(mediaMessages.map((m) => m.storage_path as string), 600)
    : { data: [] };
  const urlByPath = new Map((signedUrls.data ?? []).map((u) => [u.path, u.signedUrl ?? null]));
  const messagesSigned: Record<string, string | null> = {};
  for (const m of mediaMessages) messagesSigned[m.id] = urlByPath.get(m.storage_path) ?? null;

  const closed = conv.status === "closed";
  const grade = conv.grades?.grade ?? null;
  const maxGrade = conv.assignment?.max_grade ?? 20;
  const dueAt = conv.assignment?.due_at ?? null;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const statusKey = computeAssignmentStatus({
    role: "teacher",
    status: conv.status,
    closedBy: conv.closed_by,
    hasGrade: grade !== null,
    hasSubmission: (conv.submissions?.[0]?.count ?? 0) > 0,
    hasStudentMessage: messages.some((m) => m.sender_role === "student"),
    dueAt,
    nowMs
  }) as TeacherStatusKey;

  return (
    <>
      <LiveGradeRefresh conversationId={id} />
      <div className="relative flex h-dvh flex-col overflow-hidden">
        <header className="z-30 flex flex-col gap-3 border-b border-border/60 bg-card/95 px-4 pt-3.5 pb-3 shadow-sm backdrop-blur-xl md:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            <BackButton fallbackHref="/teacher" />
            <div className="min-w-0 flex-1">
              <h1 className="line-clamp-2 break-words text-xl font-extrabold leading-snug md:text-2xl">{conv.assignment?.title}</h1>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
            {conv.student ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
                <UserRound className="size-3.5" />
                {conv.student.full_name} ({conv.student.code})
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-bold text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {formatDueDate(dueAt)}
            </span>
            <StatusPill statusKey={statusKey} />
            <GradeAutosave conversationId={id} maxGrade={maxGrade} initialGrade={grade} />
            {closed ? (
              <ReopenConversation conversationId={id} />
            ) : (
              <ConfirmClose conversationId={id} disabled={false} />
            )}
          </div>
        </header>

        {/* Conversation — fills remaining viewport height; the chat scrolls, header stays */}
        <main className="min-h-0 flex-1 px-4 pt-3 pb-24 md:px-6 md:pb-24">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-card">
            <ChatPanel conversationId={id} initial={messages} signed={messagesSigned} mineId={profile.id} disabled={closed} fill showGrade grade={grade} maxGrade={maxGrade} />
          </div>
        </main>
      </div>
      <AppNav role="teacher" />
    </>
  );
}