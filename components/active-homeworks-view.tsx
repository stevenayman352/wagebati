"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { TEACHER_STATUSES, STATUS_LABEL, type TeacherStatusKey } from "@/lib/assignment-status";
import { formatAppDate } from "@/lib/dates";

export type ActiveHomeworkItem = {
  id: string;
  title: string;
  className: string | null;
  due_at: string | null;
  max_grade: number;
  total: number;
  statusCounts: Partial<Record<TeacherStatusKey, number>>;
};

const TABS: { key: TeacherStatusKey | "all"; label: string }[] = [
  { key: "all", label: "الكل" },
  ...TEACHER_STATUSES.map((key) => ({ key, label: STATUS_LABEL[key] }))
];

export function ActiveHomeworksView({
  items,
  initialTab
}: {
  items: ActiveHomeworkItem[];
  initialTab: TeacherStatusKey | "all";
}) {
  const [tab, setTab] = useState<TeacherStatusKey | "all">(initialTab);
  const [q, setQ] = useState("");
  const query = q.trim();

  const visible = useMemo(() => {
    let list = items;
    if (tab !== "all") list = list.filter((it) => (it.statusCounts[tab] ?? 0) > 0);
    if (query) {
      const needle = query;
      list = list.filter(
        (it) => it.title.includes(needle) || (it.className ?? "").includes(needle)
      );
    }
    return list;
  }, [items, tab, query]);

  const totalCounts = useMemo(() => {
    const counts = new Map<TeacherStatusKey | "all", number>();
    counts.set("all", items.length);
    for (const key of TEACHER_STATUSES) {
      counts.set(key, items.filter((it) => (it.statusCounts[key] ?? 0) > 0).length);
    }
    return counts;
  }, [items]);

  const activeCount = (it: ActiveHomeworkItem) =>
    tab === "all" ? it.total : (it.statusCounts[tab as TeacherStatusKey] ?? 0);

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          dir="rtl"
          placeholder="ابحث عن واجب بالاسم أو الصف..."
          className="h-10 ps-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {t.label}
            <span className={cn("tabular-nums", tab === t.key ? "opacity-80" : "opacity-60")}>
              {totalCounts.get(t.key) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          {query ? "لا توجد واجبات مطابقة للبحث." : "لا توجد واجبات بهذه الحالة."}
        </p>
      ) : (
        <div className="grid gap-2.5">
          {visible.map((a) => (
            <Link
              key={a.id}
              href={`/teacher/assignments/${a.id}`}
              className="group rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raise active:translate-y-0"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span className="block truncate text-base font-bold">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.className ? `فصل ${a.className}` : "بدون صف"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    التسليم: {formatAppDate(a.due_at)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {activeCount(a)} {tab === "all" ? "محادثة" : STATUS_LABEL[tab as TeacherStatusKey]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}