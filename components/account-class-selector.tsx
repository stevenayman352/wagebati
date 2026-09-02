"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ClassOption = { id: string; name: string };

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

export function AccountClassSelector({ classes }: { classes: ClassOption[] }) {
  const [role, setRole] = useState("student");

  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-1 gap-1.5">
        <Label htmlFor="role">الدور</Label>
        <select id="role" name="role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="student">طالب</option>
          <option value="teacher">مُدرّس</option>
          <option value="admin">ادمن</option>
        </select>
      </div>

      {role === "student" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="classId">الصف</Label>
          <select id="classId" name="classId" className={selectCls} defaultValue="">
            <option value="">بدون صف</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">ربط الطالب بصف واحد.</p>
        </div>
      ) : null}

      {role === "teacher" ? (
        <div className="grid gap-1.5">
          <Label>الصفوف</Label>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد صفوف بعد. أنشئ صفًا أولًا من قسم «صف جديد».</p>
          ) : (
            <div className="grid gap-1.5">
              {classes.map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40",
                    "has-checked:border-primary has-checked:bg-primary/[0.06]"
                  )}
                >
                  <input
                    type="checkbox"
                    name="classIds"
                    value={c.id}
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">يمكن ربط المُدرّس بأكثر من صف.</p>
        </div>
      ) : null}

      {role === "admin" ? (
        <p className="text-sm text-muted-foreground">حسابات الإدارة لا تُربط بصف.</p>
      ) : null}
    </div>
  );
}
