"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export type StudentSearchItem = {
  id: string;
  name: string;
  code: string;
  href: string;
};

export function StudentSearch({ students }: { students: StudentSearchItem[] }) {
  const [q, setQ] = useState("");
  const query = q.trim();

  const list = useMemo(() => {
    if (!query) return students;
    return students.filter((s) => s.name.includes(query));
  }, [students, query]);

  return (
    <div className="grid gap-2">
      <Input dir="rtl" placeholder="ابحث باسم الطالب..." value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length ? (
        list.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {s.name.charAt(0) || "ط"}
              </span>
              <span className="font-medium">{s.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{s.code}</span>
              <ChevronUp className="size-3.5 rotate-180 text-muted-foreground" />
            </div>
          </Link>
        ))
      ) : (
        <p className="p-4 text-center text-sm text-muted-foreground">لا توجد نتائج.</p>
      )}
    </div>
  );
}
