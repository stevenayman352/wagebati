import Link from "next/link";
import { Clock3, CheckCircle2, FileText, RefreshCw } from "lucide-react";
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

function formatDue(value: string | null | undefined) {
  if (!value) return "بدون موعد";
  const d = new Date(value);
  const now = Date.now();
  const diff = d.getTime() - now;
  const days = Math.ceil(diff / 86400000);
  const time = d.toLocaleString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (diff < 0) return "فات الموعد";
  if (days <= 1) {
    const h = Math.ceil(diff / 3600000);
    return h > 0 ? `باقي ${h} ساعة` : "باقي وقت قليل";
  }
  return `مستحق ${time}`;
}

function isLateDue(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

export function AssignmentItem({ href, row, accent }: { href: string; row: Row; accent: string }) {
  const hasSub = (r: Row) => (r.submissions?.[0]?.count ?? 0) > 0;
  const isGraded = (r: Row) => r.grades?.grade !== undefined && r.grades?.grade !== null;
  const gradePct =
    isGraded(row) && row.assignment?.max_grade
      ? Math.round((row.grades!.grade / row.assignment.max_grade) * 100)
      : null;

  let statusLabel: string;
  let statusIcon: typeof Clock3;
  let chipCls: string;
  if (row.status === "active" && row.needs_revision) {
    statusLabel = "يحتاج تعديل";
    statusIcon = RefreshCw;
    chipCls = "bg-warning/12 text-warning-foreground";
  } else if (!hasSub(row) && row.status === "active") {
    statusLabel = row.assignment?.due_at ? formatDue(row.assignment.due_at) : "أنتظر الحل";
    statusIcon = Clock3;
    chipCls = isLateDue(row.assignment?.due_at)
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary";
  } else if (hasSub(row) && row.status === "active" && !isGraded(row)) {
    statusLabel = "قيد المراجعة";
    statusIcon = Clock3;
    chipCls = "bg-muted text-muted-foreground";
  } else {
    statusLabel = isGraded(row) ? `الدرجة: ${row.grades!.grade}` : "مكتمل";
    statusIcon = CheckCircle2;
    chipCls = "bg-success/12 text-success";
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