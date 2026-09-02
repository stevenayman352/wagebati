import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";

import { MessagesSquare, ArrowLeft, ChevronUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}

type Filter = "all" | "review" | "revision" | "notsubmitted" | "recent";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "review", label: "قيد المراجعة" },
  { key: "revision", label: "مطلوب تعديل" },
  { key: "notsubmitted", label: "لم يتم التسليم" },
  { key: "recent", label: "تم التسليم" }
];

export default async function TeacherConversationsPage({
  searchParams
}: {
  searchParams: Promise<{ assignment?: string; filter?: string }>;
}) {
  const profile = await requireRole(["teacher", "admin"]);
  const { assignment, filter } = await searchParams;
  const activeFilter: Filter =
    filter === "review" || filter === "revision" || filter === "notsubmitted" || filter === "recent"
      ? filter
      : "all";
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("conversations")
    .select(
      "id, status, needs_revision, last_message_at, student:profiles!conversations_student_id_fkey(full_name, code), assignment:assignments!inner(title, id, max_grade, due_at, classes!inner(name, id))"
    )
    .order("last_message_at", { ascending: false });

  if (assignment) query = query.eq("assignment_id", assignment);
  const { data: conversations } = await query;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const cutoffIso = new Date(nowMs - 7 * 86400000).toISOString();

  const teacherClassIds = await (async () => {
    if (profile.role === "admin") {
      const { data } = await supabase.from("classes").select("id");
      return data?.map((c) => c.id) ?? [];
    }
    const { data } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", profile.id);
    return data?.map((c) => c.class_id as string) ?? [];
  })();

  const { data: unreadRows } = await supabase.rpc("unread_messages_for");
  const unread = new Map<string, number>();
  for (const row of unreadRows ?? []) unread.set(row.conversation_id, row.unread_count);

  const raw = (conversations ?? []).filter((c) => {
    const a = c.assignment as unknown as { classes?: { id: string } | null } | null;
    return a?.classes ? teacherClassIds.includes(a.classes.id) : false;
  }) as unknown as {
    id: string;
    status: string;
    needs_revision: boolean;
    last_message_at: string | null;
    student?: { full_name: string; code: string } | null;
    assignment?: {
      title: string;
      id: string;
      max_grade: number;
      due_at: string | null;
      classes?: { name: string; id: string } | null;
    } | null;
  }[];

  const recentlySubmitted = await (async () => {
    const ids = raw.map((c) => c.id as string);
    if (!ids.length) return new Set<string>();
    const { data } = await supabase
      .from("submissions")
      .select("conversation_id")
      .in("conversation_id", ids)
      .gte("submitted_at", cutoffIso);
    return new Set((data ?? []).map((s) => s.conversation_id as string));
  })();

  const anySubmitted = await (async () => {
    const ids = raw.map((c) => c.id as string);
    if (!ids.length) return new Set<string>();
    const { data } = await supabase.from("submissions").select("conversation_id").in("conversation_id", ids);
    return new Set((data ?? []).map((s) => s.conversation_id as string));
  })();

  const graded = await (async () => {
    const ids = raw.map((c) => c.id as string);
    if (!ids.length) return new Set<string>();
    const { data } = await supabase.from("grades").select("conversation_id").in("conversation_id", ids);
    return new Set((data ?? []).map((g) => g.conversation_id as string));
  })();

  const filtered = raw.filter((c) => {
    if (activeFilter === "review")
      return c.status === "active" && !c.needs_revision && (anySubmitted.has(c.id) || graded.has(c.id));
    if (activeFilter === "revision") return c.needs_revision && c.status !== "closed";
    if (activeFilter === "notsubmitted") return c.status === "active" && !anySubmitted.has(c.id) && !graded.has(c.id);
    if (activeFilter === "recent") return recentlySubmitted.has(c.id);
    return true;
  });

  const grouped = new Map<string, typeof filtered>();
  for (const c of filtered) {
    const key = c.assignment?.classes?.name || "صف غير معروف";
    const arr = grouped.get(key) ?? [];
    arr.push(c);
    grouped.set(key, arr);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], "ar"));

  const emptyText =
    activeFilter === "review"
      ? "لا توجد واجبات في انتظار التقييم. أحسنت! 🎉"
      : activeFilter === "revision"
        ? "لا توجد واجبات تحتاج تعديل. أحسنت! 🎉"
        : activeFilter === "notsubmitted"
          ? "لا توجد واجبات دون تسليم. أحسنت! 🎉"
          : activeFilter === "recent"
            ? "لا توجد تسليمات خلال آخر 7 أيام."
            : "لا توجد محادثات بعد.";

  return (
    <>
      <PageShell>
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[var(--text-h1)] font-extrabold">المحادثات</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {FILTERS.find((f) => f.key === activeFilter)?.label}
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
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/teacher/conversations${f.key === "all" ? "" : `?filter=${f.key}`}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                activeFilter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-4">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10 text-center">
              <MessagesSquare className="size-9 text-primary/30" />
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            </div>
          ) : (
            groups.map(([className, rows]) => (
              <section key={className}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  <h2 className="text-[var(--text-h3)] font-bold">{className}</h2>
                  <span className="text-sm text-muted-foreground">({rows.length})</span>
                </div>
                <div className="grid gap-2">
                  {rows.map((c) => {
                    const isRevision = c.needs_revision && c.status !== "closed";
                    const unreadCount = unread.get(c.id) ?? 0;
                    let StatusBadge: ReactNode =
                      c.status === "closed" ? (
                        <Badge variant="secondary">مكتمل</Badge>
                      ) : (
                        <Badge variant="success">قيد المراجعة</Badge>
                      );
                    if (isRevision)
                      StatusBadge = (
                        <Badge variant="warning">
                          <RefreshCw className="size-3" /> مراجعة
                        </Badge>
                      );
                    return (
                      <Link
                        key={c.id}
                        href={`/teacher/conversations/${c.id}`}
                        className="group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-raise"
                      >
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-xl",
                            isRevision ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"
                          )}
                        >
                          <MessagesSquare className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[0.95rem] font-bold">{c.assignment?.title}</span>
                            {unreadCount ? (
                              <Badge className="rounded-full px-1.5">{unreadCount} جديد</Badge>
                            ) : null}
                          </div>
                          <div className="mt-0.5 truncate text-sm text-muted-foreground">
                            {c.student ? `${c.student.full_name} (${c.student.code})` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          {StatusBadge}
                          <span className="text-[0.7rem] text-muted-foreground">{fmt(c.last_message_at)}</span>
                        </div>
                        <ChevronUp className="size-4 rotate-180 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
