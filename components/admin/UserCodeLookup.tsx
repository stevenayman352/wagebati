"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

type UserRow = { id: string; full_name: string; code: string; role: string };

function roleLabel(role: string) {
  return role === "admin" ? "ادمن" : role === "teacher" ? "مُدرّس" : "طالب";
}

export function UserCodeLookup({ users }: { users: UserRow[] }) {
  const [code, setCode] = useState("");

  const q = code.trim().toLowerCase();
  const match = q ? users.find((u) => u.code.toLowerCase() === q) : undefined;

  return (
    <div className="grid gap-1.5">
      <Input
        dir="ltr"
        required
        autoComplete="off"
        placeholder="اكتب كود الحساب..."
        value={code}
        onChange={(e) => {
          const next = e.target.value;
          const found = users.some((u) => u.code.toLowerCase() === next.trim().toLowerCase());
          e.target.setCustomValidity(found || !next.trim() ? "" : "لا يوجد حساب بهذا الكود");
          setCode(next);
        }}
      />

      <input type="hidden" name="userId" value={match?.id ?? ""} />

      {match ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground">
              <Lock className="size-4" />
            </div>
            <Input readOnly value={match.full_name} className="ps-9 font-medium" aria-label="اسم المستخدم" />
          </div>
          <Badge variant="secondary" className="shrink-0">
            {roleLabel(match.role)}
          </Badge>
        </div>
      ) : q ? (
        <p className="text-xs text-destructive" aria-live="polite">
          لا يوجد حساب بهذا الكود.
        </p>
      ) : null}
    </div>
  );
}