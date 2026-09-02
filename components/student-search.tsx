"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export function StudentSearch({ children }: { children: React.ReactNode[] }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const query = q.trim();
    if (!query) return children;
    return children.filter((child) => {
      const key = String((child as React.ReactElement<{ "data-name"?: string }>).props["data-name"] ?? "");
      return key.includes(query);
    });
  }, [children, q]);

  return (
    <div className="grid gap-2">
      <Input dir="rtl" placeholder="ابحث باسم الطالب..." value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length ? list : <p className="p-4 text-center text-sm text-muted-foreground">لا توجد نتائج.</p>}
    </div>
  );
}