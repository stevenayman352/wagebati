import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export function formatDueDate(value: string | null) {
  if (!value) return "بدون موعد";
  return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export type DueTone = "ok" | "soon" | "over" | "none";

export function dueStatusOf(value: string | null): { label: string; tone: DueTone } {
  if (!value) return { label: "بدون موعد", tone: "none" };
  const diffMs = new Date(value).getTime() - Date.now();
  const days = Math.ceil(diffMs / 86400000);
  if (days <= 0) return { label: "انتهى الموعد", tone: "over" };
  if (days === 1) return { label: "بقي يوم واحد", tone: "soon" };
  return { label: `بقي ${days} يوم`, tone: days <= 3 ? "soon" : "ok" };
}

export function DueDateCard({ dueAt }: { dueAt: string | null }) {
  const status = dueStatusOf(dueAt);
  const tones = {
    ok: "border-warning/25 bg-warning/[0.06]",
    soon: "border-warning/40 bg-warning/[0.12]",
    over: "border-destructive/30 bg-destructive/[0.06]",
    none: "border-border/70 bg-muted/40"
  } as const;
  const chip = {
    ok: "bg-warning/10 text-warning-foreground",
    soon: "bg-warning/15 text-warning-foreground",
    over: "bg-destructive/10 text-destructive",
    none: "bg-muted text-muted-foreground"
  } as const;
  const icon = {
    ok: "bg-warning/15 text-warning-foreground",
    soon: "bg-warning/20 text-warning-foreground",
    over: "bg-destructive/10 text-destructive",
    none: "bg-muted text-muted-foreground"
  } as const;

  return (
    <div className={cn("flex items-center gap-3 rounded-[var(--radius-lg)] border p-4 shadow-card", tones[status.tone])}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", icon[status.tone])}>
        <CalendarDays className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">موعد التسليم</p>
        <p className="truncate font-bold">{formatDueDate(dueAt)}</p>
      </div>
      <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", chip[status.tone])}>{status.label}</span>
    </div>
  );
}