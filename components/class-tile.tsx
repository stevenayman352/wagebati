"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { expireTeacherDashboardAction } from "@/app/actions/teacher";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One class row in the teacher dashboard.
 *
 * The student count is always shown — it is the number of students in the
 * class, independent of homework. A class with an active homework glows green
 * right away, and turns back into the plain white row the moment its last
 * active homework expires, without waiting for a reload.
 */
export function ClassTile({
  href,
  name,
  studentCount,
  active,
  dueAtMs
}: {
  href: string;
  name: string;
  studentCount: number;
  active: boolean;
  /**
   * Latest deadline among the class's active homework (the class stays green
   * until the last one ends). `null` means one of them has no deadline, so it
   * never expires on its own.
   */
  dueAtMs: number | null;
}) {
  const router = useRouter();
  // The deadline that has already expired. Storing the deadline itself (and
  // not a boolean) means a new homework or a new deadline turns the tile green
  // again without a reset effect.
  const [expiredFor, setExpiredFor] = useState<number | null>(null);
  const refreshedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!active || dueAtMs === null) return;

    const expire = () => {
      setExpiredFor(dueAtMs);
      // Re-render the server data once so the class also drops out of the
      // active-homework list. Guarded: a stale cached payload can keep the
      // same deadline and would otherwise refresh in a loop.
      if (refreshedFor.current === dueAtMs) return;
      refreshedFor.current = dueAtMs;
      void expireTeacherDashboardAction()
        .catch(() => {})
        .finally(() => router.refresh());
    };

    const delay = dueAtMs - Date.now();

    // Always asynchronous: a deadline that already passed (stale cached data)
    // fires on the next tick instead of updating state during the effect body.
    // +1s so the server and the browser agree the deadline has passed.
    const timer = setTimeout(expire, Math.max(delay + 1000, 0));
    return () => clearTimeout(timer);
  }, [active, dueAtMs, router]);

  const isActive = active && (dueAtMs === null || expiredFor !== dueAtMs);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-all duration-500",
        isActive
          ? "border-success/45 bg-success/[0.07] shadow-[0_0_18px_-6px] shadow-success/50 hover:border-success/70 hover:bg-success/10"
          : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full transition-colors duration-500",
            isActive ? "animate-pulse bg-success" : "bg-muted-foreground/30"
          )}
        />
        <span className="truncate">فصل {name}</span>
      </span>
      <Badge variant={isActive ? "success" : "secondary"} className="shrink-0 tabular-nums">
        {studentCount} طالب
      </Badge>
    </Link>
  );
}
