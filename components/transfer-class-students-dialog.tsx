"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { transferStudentsAction } from "@/app/actions/admin";
import { isCrossYearTransfer, type TransferClass } from "@/lib/transfer";
import { AlertTriangle, ArrowRightLeft, CheckSquare, Loader2, Square } from "lucide-react";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClassStudent = { id: string; name: string; code: string };

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

const initialState: ActionState = { ok: false, message: "" };

/**
 * Transfers students out of one class: pick any subset of the class's students
 * (or all), then a target class. Warns when the target is a different year.
 */
export function TransferClassStudentsDialog({
  sourceClass,
  students,
  allClasses
}: {
  sourceClass: TransferClass;
  students: ClassStudent[];
  allClasses: TransferClass[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState("");
  const [state, setState] = useState<ActionState>(initialState);
  const [pending, setPending] = useState(false);

  const targets = useMemo(() => allClasses.filter((c) => c.id !== sourceClass.id), [allClasses, sourceClass.id]);
  const target = targets.find((c) => c.id === targetId) ?? null;

  const isCrossYear = target ? isCrossYearTransfer(sourceClass.gradeLabel, target.gradeLabel) : false;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => (prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))));
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setState(initialState);
      setTargetId("");
      setSelected(new Set());
    }
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || !targetId || pending) return;
    setPending(true);
    const formData = new FormData();
    selected.forEach((id) => formData.append("studentIds", id));
    formData.append("targetClassId", targetId);
    const result = await transferStudentsAction(initialState, formData);
    setPending(false);
    setState(result);
    if (result.ok) {
      handleOpenChange(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <ArrowRightLeft className="size-3.5" /> نقل الطلاب
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" />
            نقل طلاب «{sourceClass.name}»
          </DialogTitle>
          <DialogDescription>
            اختر الطلاب المراد نقلهم ثم الصف الجديد. النقل داخل نفس السنة يُبقي السجل والدرجات كما هي.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>الطلاب ({students.length})</Label>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={selectAll}>
                {selected.size === students.length && students.length > 0 ? (
                  <CheckSquare className="size-3.5" />
                ) : (
                  <Square className="size-3.5" />
                )}
                {selected.size === students.length && students.length > 0 ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </Button>
            </div>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد طلاب في هذا الصف.</p>
            ) : (
              <div className="grid max-h-56 gap-1 overflow-y-auto pe-1">
                {students.map((student) => {
                  const isSelected = selected.has(student.id);
                  return (
                    <label
                      key={student.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40",
                        "has-checked:border-primary has-checked:bg-primary/[0.06]"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(student.id)}
                        className="size-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 truncate">{student.name}</span>
                      {student.code ? (
                        <span className="ms-auto shrink-0 font-mono text-xs text-muted-foreground" dir="ltr">
                          {student.code}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="classTransferTarget">الصف الجديد</Label>
            <select
              id="classTransferTarget"
              className={selectCls}
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                if (state.message) setState(initialState);
              }}
            >
              <option value="">اختر الصف...</option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.gradeLabel ? ` — ${c.gradeLabel}` : " — بدون سنة"}
                </option>
              ))}
            </select>
          </div>

          {target && !target.gradeLabel ? (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              ⚠️ هذا الصف بدون سنة/مرحلة محددة، لذلك لن يتم مسح أي سجل قديم. عدّل الصف لتخصيص السنة.
            </p>
          ) : null}

          {isCrossYear && target ? (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong>تنبيه:</strong> «{sourceClass.name}» تختلف سنة دراسية عن «{target.name}»،
                لذلك سيُحذف سجل المحادثات والدرجات القديمة للمحدّدين نهائيًا. لا يمكن التراجع.
              </p>
            </div>
          ) : null}

          {state.message ? (
            <p className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {state.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            إلغاء
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={selected.size === 0 || !targetId || pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> جارِ النقل...
              </>
            ) : (
              `نقل ${selected.size} طالب`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
