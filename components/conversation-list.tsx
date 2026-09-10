"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronUp, MessagesSquare, Search } from "lucide-react";
import type { TeacherStatusKey } from "@/lib/assignment-status";
import { StatusPill, statusVisual } from "@/components/status-chip";
import { Input } from "@/components/ui/input";

export type ConversationRow = {
  id: string;
  href: string;
  title: string;
  name: string | null;
  code: string | null;
  statusKey: TeacherStatusKey;
  unread: number;
  lastAt: string | null;
};

export type ConversationSection = {
  name: string;
  rows: ConversationRow[];
};

function fmt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
}

export function ConversationList({
  sections,
  emptyText
}: {
  sections: ConversationSection[];
  emptyText: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim();

  const filtered = useMemo(() => {
    if (!query) return sections;
    return sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          (r) => r.name?.includes(query) || r.code?.includes(query)
        )
      }))
      .filter((s) => s.rows.length > 0);
  }, [sections, query]);

  const total = filtered.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          dir="rtl"
          placeholder="ابحث باسم الطالب أو الكود..."
          className="h-10 ps-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10 text-center">
          <MessagesSquare className="size-9 text-primary/30" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        filtered.map((section) => (
          <section key={section.name}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" />
              <h2 className="text-[var(--text-h3)] font-bold">{section.name}</h2>
              <span className="text-sm text-muted-foreground">({section.rows.length})</span>
            </div>
            <div className="grid gap-2">
              {section.rows.map((c, i) => {
                const { Icon, cls } = statusVisual(c.statusKey);
                return (
                  <Link
                    key={c.id}
                    href={c.href}
                    style={{ animationDelay: `${i * 35}ms` }}
                    className="animate-slide-up group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-raise"
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${cls}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[0.95rem] font-bold">{c.title}</span>
                        {c.unread ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold text-primary-foreground">
                            {c.unread} جديد
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {c.name ? `${c.name}${c.code ? ` (${c.code})` : ""}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusPill statusKey={c.statusKey} />
                      <span className="text-[0.7rem] text-muted-foreground">{fmt(c.lastAt)}</span>
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
  );
}