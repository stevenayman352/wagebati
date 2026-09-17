"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, animate, motion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  ChevronUp,
  MessagesSquare,
  School,
  Sparkles,
  Users
} from "lucide-react";
import { STATUS_LABEL, TEACHER_STATUSES, type TeacherStatusKey } from "@/lib/assignment-status";
import { statusVisual } from "@/components/status-chip";
import { APP_TIME_ZONE, formatAppDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type StatsStudent = {
  name: string;
  code: string;
  conversationId: string;
};

export type HomeworkStat = {
  id: string;
  title: string;
  dueAt: string | null;
  ended: boolean;
  className: string | null;
  teacherNames: string[];
  counts: Record<TeacherStatusKey, number>;
  students: Record<TeacherStatusKey, StatsStudent[]>;
};

function formatDue(value: string | null) {
  return formatAppDate(value);
}

function schoolDayNumber(ms: number): number {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ms);
  return Number(day.replace(/-/g, ""));
}

function relativeDue(value: string | null): string | null {
  if (!value) return null;
  const days = schoolDayNumber(new Date(value).getTime()) - schoolDayNumber(Date.now());
  if (days > 1) return `بقي ${days} يوم`;
  if (days === 1) return "آخر يوم غدًا";
  if (days === 0) return "آخر يوم اليوم";
  return "انتهى الموعد";
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current ?? 0;
    prevRef.current = value;
    const controls = animate(from, value, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v))
    });
    return () => controls.stop();
  }, [value]);

  return <>{display}</>;
}

function StatusCard({
  statusKey,
  count,
  active,
  onSelect
}: {
  statusKey: TeacherStatusKey;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const { Icon, cls } = statusVisual(statusKey);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 text-start shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raise active:scale-[0.98]",
        active && "ring-2 ring-primary/30"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
            cls
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-[1.7rem] font-extrabold leading-none tabular-nums">
          <AnimatedNumber value={count} />
        </span>
      </span>
      <p className="mt-2.5 text-xs font-semibold text-muted-foreground">{STATUS_LABEL[statusKey]}</p>
      <span
        className={cn(
          "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary/60 transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  );
}

export function TeacherStatistics({ homeworkStats }: { homeworkStats: HomeworkStat[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<TeacherStatusKey | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const selected = homeworkStats.find((h) => h.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const el = tabRefs.current.get(selectedId);
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [selectedId]);

  if (homeworkStats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-12 text-center">
        <BarChart3 className="size-10 text-primary/30" />
        <p className="text-sm text-muted-foreground">لا توجد واجبات منشورة بعد لعرض إحصائياتها.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Homework selector */}
      <div className="sticky top-0 z-10 -mx-4 overflow-hidden bg-background/85 py-2 backdrop-blur md:mx-0">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1.5 md:px-0">
          {homeworkStats.map((h) => {
            const isActive = h.id === selectedId;
            const ended = h.ended;
            return (
              <button
                key={h.id}
                type="button"
                ref={(el) => {
                  if (el) tabRefs.current.set(h.id, el);
                  else tabRefs.current.delete(h.id);
                }}
                onClick={() => setSelectedId(h.id)}
                className={cn(
                  "flex shrink-0 flex-col items-start gap-1 rounded-2xl border px-3.5 py-2 text-start transition-all duration-200 active:scale-[0.97]",
                  isActive
                    ? ended
                      ? "border-destructive bg-destructive text-white shadow-raise"
                      : "border-primary/60 bg-primary text-primary-foreground shadow-raise"
                    : ended
                      ? "border-destructive/40 bg-destructive/[0.04] text-foreground hover:border-destructive/60 hover:shadow-card"
                      : "border-border/70 bg-card text-foreground hover:border-primary/40 hover:shadow-card"
                )}
              >
                <span className="flex max-w-44 items-center gap-1.5">
                  {ended && (
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", isActive ? "bg-white" : "bg-destructive")}
                    />
                  )}
                  <span className="truncate text-sm font-bold">{h.title}</span>
                </span>
                <span
                  className={cn(
                    "flex max-w-44 items-center gap-1 text-[0.68rem]",
                    isActive
                      ? ended
                        ? "text-white/85"
                        : "text-primary-foreground/85"
                      : ended
                        ? "text-destructive/80"
                        : "text-muted-foreground"
                  )}
                >
                  <School
                    className={cn(
                      "size-3 shrink-0",
                      !isActive && (ended ? "text-destructive" : "text-primary")
                    )}
                  />
                  <span dir="auto" className="min-w-0 truncate">
                    {h.className ?? "بدون صف"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!selected ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-12 text-center"
        >
          <span className="relative flex size-16 items-center justify-center rounded-3xl bg-primary/10">
            <Sparkles className="size-7 text-primary" />
            <span className="absolute -end-1 -top-1 size-3 rounded-full bg-primary/20" />
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            اختر واجبًا من الشريط أعلاه لعرض إحصائياته وأسماء طلابه
          </p>
        </motion.div>
      ) : (
        <>
          {/* Selected homework header */}
          <motion.div
            key={`header-${selected.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <h2 className="truncate font-amiri text-2xl font-bold">{selected.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
                  <School className="size-3.5 text-primary" />
                  فصل {selected.className ?? "غير معروف"}
                </span>
                {selected.teacherNames.length > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
                      <Users className="size-3.5 text-primary" />
                      المدرسون
                    </span>
                    {selected.teacherNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary"
                      >
                        {name}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-bold",
                selected.ended
                  ? "border-destructive/25 bg-destructive/[0.06] text-destructive"
                  : "border-primary/20 bg-primary/[0.04] text-primary"
              )}
            >
              <CalendarDays className="size-4" />
              {formatDue(selected.dueAt)}
            </div>
          </motion.div>

          {/* Cards */}
          <section className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card md:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/12">
                <BarChart3 className="size-4 text-primary" />
              </span>
              <div>
                <h2 className="text-[var(--text-h2)] font-bold">إحصائيات واجبات الأسبوع الحالي</h2>
                {selected.dueAt ? (
                  <p
                    className={cn(
                      "text-xs",
                      selected.ended ? "font-bold text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {selected.ended ? "انتهى موعد الواجب" : relativeDue(selected.dueAt)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              {TEACHER_STATUSES.map((key) => (
                <StatusCard
                  key={key}
                  statusKey={key}
                  count={selected.counts[key] ?? 0}
                  active={activeStatus === key}
                  onSelect={() => setActiveStatus(activeStatus === key ? null : key)}
                />
              ))}
            </div>
          </section>

          {/* Students */}
          <div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${selected.id}-${activeStatus ?? "none"}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                {activeStatus ? (
                  <div className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card md:p-5">
                    <StudentHeader statusKey={activeStatus} count={selected.students[activeStatus].length} />
                    {selected.students[activeStatus].length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                        <MessagesSquare className="size-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">لا يوجد طلاب بهذه الحالة في هذا الواجب.</p>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selected.students[activeStatus].map((s, i) => (
                          <motion.div
                            key={s.conversationId}
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.28, ease: "easeOut" }}
                          >
                            <Link
                              href={`/teacher/conversations/${s.conversationId}`}
                              prefetch={true}
                              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raise active:translate-y-0"
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                                {s.name.trim().charAt(0) ?? "؟"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">{s.name}</span>
                                <span className="block text-xs text-muted-foreground">الكود: {s.code || "—"}</span>
                              </span>
                              <ChevronUp className="size-4 rotate-180 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                            </Link>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 text-sm text-muted-foreground">
                    <Users className="size-4 text-primary/60" />
                    اضغط على أي بطاقة لعرض أسماء الطلاب في هذه الحالة
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function StudentHeader({ statusKey, count }: { statusKey: TeacherStatusKey; count: number }) {
  const { Icon, cls } = statusVisual(statusKey);
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-full", cls)}>
          <Icon className="size-4" />
        </span>
        <h3 className="text-[var(--text-h3)] font-bold">طلاب {STATUS_LABEL[statusKey]}</h3>
      </div>
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
        {count}
      </span>
    </div>
  );
}