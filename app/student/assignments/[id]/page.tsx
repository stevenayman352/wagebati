import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/app-nav";
import { ChatPanel } from "@/components/chat-panel";
import { LiveGradeRefresh } from "@/components/live-grade-refresh";
import { SubmissionHistory } from "@/components/submission-history";
import type { ThreadMessage } from "@/components/conversation-thread";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ArrowRight, Paperclip, ChevronDown, CheckCircle2, XCircle, Clock3 } from "lucide-react";

type SubmissionImage = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  sort_number: number;
};

type Submission = {
  id: string;
  attempt_number: number;
  video_path: string | null;
  video_name: string | null;
  voice_path: string | null;
  voice_name: string | null;
  submitted_at: string;
  submission_images?: SubmissionImage[];
};

export default async function StudentAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["student"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, assignment_id, status, needs_revision, closed_at, grades(grade), assignment:assignments!inner(title, instructions, due_at, max_grade, status)"
    )
    .eq("id", id)
    .eq("student_id", profile.id)
    .single();
  if (!conversation) notFound();

  const conv = conversation as unknown as {
    id: string;
    assignment_id: string;
    status: string;
    needs_revision: boolean;
    closed_at: string | null;
    grades?: { grade: number } | null;
    assignment?: { title: string; instructions: string | null; due_at: string | null; max_grade: number; status: string } | null;
  };

  const assignmentId = conv.assignment_id;
  const [attachmentsRes, submissionsRes, messagesRes] = await Promise.all([
    assignmentId
      ? supabase
          .from("assignment_attachments")
          .select("id, file_name, mime_type, storage_path")
          .eq("assignment_id", assignmentId)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    supabase
      .from("submissions")
      .select("id, attempt_number, video_path, video_name, voice_path, voice_name, submitted_at, submission_images(id, storage_path, file_name, mime_type, sort_number)")
      .eq("conversation_id", id)
      .order("attempt_number", { ascending: false }),
    supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, storage_path, file_name, mime_type, file_size, duration_seconds, deleted_from_storage_at, reply_to_message_id, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .limit(1000)
  ]);

  const attachments = (attachmentsRes.data ?? []) as { id: string; file_name: string; storage_path: string }[];
  const submissions = (submissionsRes.data ?? []) as unknown as Submission[];
  const threadMessages = (messagesRes.data ?? []) as unknown as ThreadMessage[];

  const mediaTargets: { key: string; path: string }[] = submissions.flatMap((s) => [
    ...(s.video_path ? [{ key: `video-${s.id}`, path: s.video_path }] : []),
    ...(s.voice_path ? [{ key: `voice-${s.id}`, path: s.voice_path }] : []),
    ...(s.submission_images ?? []).map((img) => ({ key: `img-${img.id}`, path: img.storage_path }))
  ]);

  const [attachmentUrls, submissionUrlResults, messageUrlResults] = await Promise.all([
    attachments.length
      ? supabase.storage.from("assignment-attachments").createSignedUrls(attachments.map((a) => a.storage_path), 600)
      : Promise.resolve({ data: [] }),
    mediaTargets.length
      ? supabase.storage.from("submissions").createSignedUrls(mediaTargets.map((t) => t.path), 600)
      : Promise.resolve({ data: [] }),
    threadMessages.some((m) => m.storage_path)
      ? supabase.storage
          .from("message-media")
          .createSignedUrls(
            threadMessages.filter((m): m is typeof m & { storage_path: string } => Boolean(m.storage_path)).map((m) => m.storage_path),
            600
          )
      : Promise.resolve({ data: [] })
  ]);

  const attachmentUrlByPath = new Map((attachmentUrls.data ?? []).map((u) => [u.path, u.signedUrl ?? null]));
  const attachmentUrlList = attachments.map((a) => attachmentUrlByPath.get(a.storage_path) ?? null);

  const submissionUrlByPath = new Map((submissionUrlResults.data ?? []).map((u) => [u.path, u.signedUrl ?? null]));
  const submissionUrls: Record<string, string | null> = {};
  for (const t of mediaTargets) submissionUrls[t.key] = submissionUrlByPath.get(t.path) ?? null;

  const active = conv.status === "active";
  const grade = conv.grades?.grade ?? null;
  const maxGrade = conv.assignment?.max_grade ?? 20;
  // Server component evaluated once per request; the timestamp is fresh each render.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const homeworkState =
    conv.status === "closed"
      ? { label: grade !== null ? `مكتمل · الدرجة ${grade}/${maxGrade}` : "مكتمل", cls: "border-success/30 bg-success/10 text-success", Icon: CheckCircle2 }
      : grade === null && conv.assignment?.due_at && nowMs > new Date(conv.assignment.due_at).getTime()
        ? { label: "فات الموعد", cls: "border-destructive/30 bg-destructive/10 text-destructive", Icon: XCircle }
        : { label: "قيد المراجعة", cls: "border-border/70 bg-muted/40 text-muted-foreground", Icon: Clock3 };

  const messageUrlByPath = new Map((messageUrlResults.data ?? []).map((u) => [u.path, u.signedUrl ?? null]));
  const messageSigned: Record<string, string | null> = {};
  for (const m of threadMessages) {
    if (m.storage_path) messageSigned[m.id] = messageUrlByPath.get(m.storage_path) ?? null;
  }

  return (
    <>
      {/* Chat-first full-height layout */}
      <div className="relative flex h-dvh flex-col overflow-hidden">
        <header className="z-30 flex flex-col gap-3 border-b border-border/60 bg-card/95 px-4 pt-3.5 pb-3 shadow-sm backdrop-blur-xl md:px-6">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-mx-2 shrink-0 text-muted-foreground">
              <Link href="/student" className="gap-1.5">
                <ArrowRight className="size-4" />
                رجوع
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold leading-snug">{conv.assignment?.title}</h1>
            </div>
            {submissions.length ? <SubmissionHistory submissions={submissions} urls={submissionUrls} /> : null}
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold", homeworkState.cls)}>
              <homeworkState.Icon className="size-3.5" />
              {homeworkState.label}
            </span>
          </div>

          {conv.assignment?.instructions ? (
            <div className="mx-auto flex w-full max-w-5xl items-center gap-2">
              <details className="group">
                <summary className="inline-flex list-none cursor-pointer items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-bold text-muted-foreground transition-colors [&::-webkit-details-marker]:hidden">
                  <Paperclip className="size-3.5" />
                  التعليمات
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute right-4 left-4 z-20 mt-2 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-xl md:right-6 md:left-6">
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-foreground/90">{conv.assignment.instructions}</p>
                  {attachments.length ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">مرفقات ({attachments.length})</p>
                      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                        {attachments.map((a, i) =>
                          attachmentUrlList[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={a.id}
                              src={attachmentUrlList[i] ?? ""}
                              alt={a.file_name}
                              className="aspect-square w-full cursor-pointer rounded-lg border border-border/70 object-cover transition-transform hover:scale-[1.03]"
                            />
                          ) : (
                            <a
                              key={a.id}
                              href={attachmentUrlList[i] ?? "#"}
                              className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
                            >
                              {a.file_name}
                            </a>
                          )
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}
        </header>

        {/* Conversation — fills remaining viewport height; the chat scrolls, header stays */}
        <main className="min-h-0 flex-1 px-2 pt-2 pb-20 sm:px-4 md:px-6 md:pb-24">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-card">
            <ChatPanel
              conversationId={id}
              initial={threadMessages}
              signed={messageSigned}
              mineId={profile.id}
              disabled={!active}
              fill
              grade={grade}
              maxGrade={maxGrade}
            />
            <LiveGradeRefresh conversationId={id} />
          </div>
        </main>
      </div>

      <AppNav role="student" />
    </>
  );
}
