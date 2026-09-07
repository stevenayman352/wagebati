import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { STATUS_LABEL } from "@/lib/assignment-status";
import { cn } from "@/lib/utils";

const VISUAL: Record<
  string,
  { Icon: typeof Clock3; cls: string }
> = {
  not_submitted: { Icon: Clock3, cls: "bg-muted text-muted-foreground" },
  under_review: { Icon: Clock3, cls: "bg-primary/10 text-primary" },
  awaiting_grading: { Icon: Clock3, cls: "bg-warning/15 text-warning-foreground" },
  overdue_not_submitted: { Icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  graded: { Icon: CheckCircle2, cls: "bg-success/12 text-success" },
  completed: { Icon: CheckCircle2, cls: "bg-secondary text-secondary-foreground" },
  submitted: { Icon: CheckCircle2, cls: "bg-success/12 text-success" },
  missed: { Icon: XCircle, cls: "bg-destructive/10 text-destructive" }
};

export function statusVisual(statusKey: string) {
  return (
    VISUAL[statusKey] ?? { Icon: Clock3, cls: "bg-muted text-muted-foreground" }
  );
}

export function StatusPill({
  statusKey,
  className
}: {
  statusKey: string;
  className?: string;
}) {
  const { Icon, cls } = statusVisual(statusKey);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold whitespace-nowrap",
        cls,
        className
      )}
    >
      <Icon className="size-3.5" />
      {STATUS_LABEL[statusKey] ?? statusKey}
    </span>
  );
}