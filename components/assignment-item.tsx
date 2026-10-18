import Link from "next/link";
import { FileText } from "lucide-react";
import type { StudentStatusKey } from "@/lib/assignment-status";
import { StatusPill } from "@/components/status-chip";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
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

export function AssignmentItem({
  href,
  row,
  accent,
  statusKey
}: {
  href: string;
  row: Row;
  accent: string;
  statusKey: StudentStatusKey;
}) {
  return (
    <Link
      href={href}
      className="animate-slide-up group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill statusKey={statusKey} />
      </div>
    </Link>
  );
}