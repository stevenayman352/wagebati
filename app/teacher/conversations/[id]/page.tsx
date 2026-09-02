import { notFound } from "next/navigation";
import Link from "next/link";
import { ChatPanel } from "@/components/chat-panel";
import type { ThreadMessage } from "@/components/conversation-thread";
import { ConfirmClose } from "@/components/confirm-close";
import { ReopenConversation } from "@/components/reopen-conversation";
import { GradeAutosave } from "@/components/grade-autosave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/app-nav";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDueDate } from "@/components/due-date-card";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";

export default async function TeacherConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, status, needs_revision, closed_at, grades(grade), student:profiles!conversations_student_id_fkey(full_name, code), assignment:assignments!inner(title, due_at, max_grade)"
    )
    .eq("id", id)
    .single();
  if (!conversation) notFound();

  const conv = conversation as unknown as {
    id: string;
    status: string;
    needs_revision: boolean;
    closed_at: string | null;
    grades?: { grade: number } | null;
    student?: { full_name: string; code: string } | null;
    assignment?: { title: string; due_at: string | null; max_grade: number } | null;
  };

  const { data: messagesRes } = await supabase
    .from("messages")
    .select("id, sender_id, sender_role, kind, body, storage_path, file_name, mime_type, file_size, duration_seconds, deleted_from_storage_at, reply_to_message_id, created_at")
    .eq("conversation_id", id)
    .order("created_at")
    .limit(1000);

  const messages = (messagesRes ?? []) as unknown as ThreadMessage[];

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

  return (
    <>
      <div className="relative flex h-dvh flex-col overflow-hidden">
        <header className="z-30 flex flex-col gap-3 border-b border-border/60 bg-card/95 px-4 pt-3.5 pb-3 shadow-sm backdrop-blur-xl md:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-mx-2 shrink-0 text-muted-foreground">
              <Link href="/teacher/conversations" className="gap-1.5">
                <ArrowLeft className="size-4" />
                رجوع
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold leading-snug">{conv.assignment?.title}</h1>
            </div>
            {conv.needs_revision && !closed ? <Badge variant="warning">بانتظار مراجعة الطالب</Badge> : null}
            {closed ? <Badge variant="success">مكتمل</Badge> : <Badge>قيد المراجعة</Badge>}
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
            <ChatPanel conversationId={id} initial={messages} signed={messagesSigned} mineId={profile.id} disabled={closed} fill grade={grade} maxGrade={maxGrade} />
          </div>
        </main>
      </div>
      <AppNav role="teacher" />
    </>
  );
}