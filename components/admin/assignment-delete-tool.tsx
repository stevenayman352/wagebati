"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2 } from "lucide-react";
import { deleteAssignmentByTitleAction } from "@/app/actions/admin";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatAppDate } from "@/lib/dates";

const initialState: ActionState = { ok: false, message: "" };

export function AssignmentDeleteTool() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteAssignmentByTitleAction,
    initialState
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const matches = state.matches ?? [];
  const showList = matches.length > 0;

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="assignmentTitle">اسم الواجب</Label>
          <Input
            id="assignmentTitle"
            name="title"
            placeholder="اكتب كلمة أو جزءًا من العنوان..."
            required
            minLength={2}
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending} className="gap-1.5 sm:col-span-2">
          <Search className="size-4" />
          {pending ? "جارِ البحث..." : "بحث"}
        </Button>
      </form>

      {state.message ? (
        <p className={cn("text-sm", state.ok ? "text-primary" : "text-destructive")}>{state.message}</p>
      ) : null}

      {showList ? (
        <ul className="grid gap-2">
          {matches.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-border/70 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[m.className, m.teacherName ? `معلم: ${m.teacherName}` : "", `${m.conversationCount} محادثة`]
                      .filter(Boolean)
                      .join(" · ")}
                    {m.dueAt ? ` · التسليم: ${formatAppDate(m.dueAt)}` : ""}
                  </p>
                </div>
                <Badge variant="destructive">منشور</Badge>
              </div>

              {confirmId !== m.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmId(m.id)}
                >
                  <Trash2 className="size-3.5" />
                  حذف
                </Button>
              ) : (
                <div className="mt-2 flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmId(null)}
                  >
                    إلغاء
                  </Button>
                  <form action={formAction}>
                    <input type="hidden" name="assignmentId" value={m.id} />
                    <input type="hidden" name="confirm" value="true" />
                    <Button type="submit" variant="destructive" size="sm" className="h-7 px-2 text-xs" disabled={pending}>
                      {pending ? "جارِ الحذف..." : "تأكيد الحذف"}
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}