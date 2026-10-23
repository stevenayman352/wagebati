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
import { previewTransferGradesAction, transferStudentsAction } from "@/app/actions/admin";
import { GradeMappingForm } from "@/components/grade-mapping-form";
import { isCrossYearTransfer, type TransferClass } from "@/lib/transfer";
import type { TransferGradePlan, TransferGradePreview } from "@/lib/transfer-grades";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CheckSquare,
  Loader2,
  Square
} from "lucide-react";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClassStudent = { id: string; name: string; code: string };

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

const initialState: ActionState = { ok: false, message: "" };

type Step = "form" | "mapping" | "done";

/**
 * Transfers students out of one class: pick any subset of the class's students
 * (or all), then a target class. Warns when the target is a different year.
 * Same-year moves open a mapping step when the old and new homework cannot be
 * matched silently.
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
  const [step, setStep] = useState<Step>("form");
  const [preview, setPreview] = useState<TransferGradePreview | null>(null);

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
      setStep("form");
      setPreview(null);
      setPending(false);
    }
  };

  const buildFormData = () => {
    const formData = new FormData();
    selected.forEach((id) => formData.append("studentIds", id));
    formData.append("targetClassId", targetId);
    formData.append("sourceClassId", sourceClass.id);
    return formData;
  };

  const applyTransfer = async (plan: TransferGradePlan) => {
    if (pending) return;
    setPending(true);
    const formData = buildFormData();
    formData.append("gradePlan", JSON.stringify(plan));
    const result = await transferStudentsAction(initialState, formData);
    setPending(false);
    setState(result);
    if (result.ok) setStep("done");
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || !targetId || pending) return;
    setPending(true);
    setState(initialState);
    const result = await previewTransferGradesAction(initialState, buildFormData());
    setPending(false);

    if (!result.ok || !result.gradePreview) {
      setState(result);
      return;
    }

    if (result.gradePreview.needsReview) {
      setPreview(result.gradePreview);
      setStep("mapping");
      return;
    }

    await applyTransfer(result.gradePreview.autoPlan);
  };

  const handleDone = () => {
    handleOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <ArrowRightLeft className="size-3.5" /> نقل الطلاب
        </Button>
      </DialogTrigger>
      <DialogContent className={step === "mapping" ? "sm:max-w-3xl" : undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" />
            نقل طلاب «{sourceClass.name}»
          </DialogTitle>
          <DialogDescription>
            {step === "done"
              ? "تم تنفيذ النقل."
              : step === "mapping"
                ? "راجع درجات الصف القديم وحدد الواجب المقابل في الصف الجديد."
                : "اختر الطلاب المراد نقلهم ثم الصف الجديد. النقل داخل نفس السنة ينقل الدرجات مع الطالب."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <>
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
                    <Loader2 className="size-4 animate-spin" /> جارِ التجهيز...
                  </>
                ) : (
                  `متابعة نقل ${selected.size} طالب`
                )}
              </Button>
            </DialogFooter>
          </>
        ) : step === "mapping" && preview ? (
          <GradeMappingForm
            preview={preview}
            pending={pending}
            error={state.ok ? null : state.message || null}
            onCancel={() => {
              setStep("form");
              setPreview(null);
              setState(initialState);
            }}
            onConfirm={applyTransfer}
          />
        ) : (
          <div className="grid gap-4 py-2">
            <div className="flex items-start gap-3 rounded-xl bg-success/10 px-4 py-3 text-success">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm">{state.message || "تم نقل الطلاب."}</p>
            </div>
            <Button type="button" onClick={handleDone}>
              تم
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
