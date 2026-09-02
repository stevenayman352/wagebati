import Link from "next/link";
import { Clock3, CheckCircle2, FileText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
  needs_revision: boolean;
  closed_at: string | null;
  grades?: { grade: number } | null;
  submissions?: { count: number }[] | null;
  assignment?: {
    title?: string;
    due_at?: string | null;
    max_grade?: number;
    status?: string;
    classes?: { name?: string } | null;
  } | null;
};

export function AssignmentItem({ href, row, accent, state }: { href: string; row: Row; accent: string; state: "completed" | "overdue" | "underReview" }) {
  const isGraded = (r: Row) => r.grades?.grade !== undefined && r.grades?.grade !== null;
  const gradePct =
    isGraded(row) && row.assignment?.max_grade
      ? Math.round((row.grades!.grade / row.assignment.max_grade) * 100)
      : null;

  let statusLabel: string;
  let statusIcon: typeof Clock3;
  let chipCls: string;
  if (state === "completed") {
    statusLabel = "مكتمل";
    statusIcon = CheckCircle2;
    chipCls = "bg-success/12 text-success";
  } else if (state === "overdue") {
    statusLabel = "فات الموعد";
    statusIcon = XCircle;
    chipCls = "bg-destructive/10 text-destructive";
  } else {
    statusLabel = "قيد المراجعة";
    statusIcon = Clock3;
    chipCls = "bg-muted text-muted-foreground";
  }
  const StatusIcon = statusIcon;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
    >
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105",
          accent
        )}
      >
        <FileText className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold leading-snug">{row.assignment?.title ?? "واجب"}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.assignment?.classes?.name ? `${row.assignment.classes.name} · ` : ""}
          {row.assignment?.max_grade ? `${row.assignment.max_grade} درجة` : ""}
        </div>
        {gradePct !== null ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", gradePct >= 50 ? "bg-success" : "bg-warning")}
                style={{ width: `${gradePct}%` }}
              />
            </div>
            <span className="text-[0.7rem] font-semibold text-muted-foreground">{gradePct}%</span>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold", chipCls)}>
          <StatusIcon className="size-3.5" />
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}