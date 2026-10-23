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
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Loader2, School } from "lucide-react";
import type { ActionState } from "@/lib/types";

export type TransferStudent = {
  id: string;
  name: string;
  code: string;
  /** Names of the classes the student is currently linked to (may be empty). */
  currentClasses: string[];
};

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

const initialState: ActionState = { ok: false, message: "" };

type Step = "form" | "mapping" | "done";

/**
 * Admin-only transfer dialog: pick a target class for one or more students.
 * Shows a red warning when the target is a different year (grade_label), since
 * that deletes the old class record for those students. Same-year moves open
 * a mapping step when the old and new homework cannot be matched silently.
 */
export function TransferStudentsDialog({
  classes,
  students,
  triggerLabel = "نقل",
  triggerVariant = "outline"
}: {
  classes: TransferClass[];
  students: TransferStudent[];
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [state, setState] = useState<ActionState>(initialState);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [preview, setPreview] = useState<TransferGradePreview | null>(null);

  const target = classes.find((c) => c.id === targetId) ?? null;

  const isCrossYear = useMemo(() => {
    if (!target) return false;
    // Warn when ANY selected student comes from a different year.
    return students.some((student) =>
      student.currentClasses.some((name) => {
        const source = classes.find((c) => c.name === name);
        return source ? isCrossYearTransfer(source.gradeLabel, target.gradeLabel) : false;
      })
    );
  }, [classes, students, target]);

  const blocked = students.length === 0 || !targetId;

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setState(initialState);
      setTargetId("");
      setStep("form");
      setPreview(null);
      setPending(false);
    }
  };

  const applyTransfer = async (plan: TransferGradePlan) => {
    if (pending) return;
    setPending(true);
    const formData = new FormData();
    students.forEach((student) => formData.append("studentIds", student.id));
    formData.append("targetClassId", targetId);
    formData.append("gradePlan", JSON.stringify(plan));
    const result = await transferStudentsAction(initialState, formData);
    setPending(false);
    setState(result);
    if (result.ok) setStep("done");
  };

  const handleSubmit = async () => {
    if (blocked || pending) return;
    setPending(true);
    setState(initialState);
    const formData = new FormData();
    students.forEach((student) => formData.append("studentIds", student.id));
    formData.append("targetClassId", targetId);
    const result = await previewTransferGradesAction(initialState, formData);
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

  const namesLabel =
    students.length <= 3
      ? students.map((s) => s.name).join("، ")
      : `${students.length} طلاب`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size="sm" className="gap-1.5">
          <ArrowRightLeft className="size-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className={step === "mapping" ? "sm:max-w-3xl" : undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="size-5" />
            نقل إلى صف آخر
          </DialogTitle>
          <DialogDescription>
            {step === "done"
              ? "تم تنفيذ النقل."
              : step === "mapping"
                ? "راجع درجات الصف القديم وحدد الواجب المقابل في الصف الجديد."
                : `نقل ${students.length === 1 ? `الطالب «${namesLabel}»` : namesLabel} من صفه الحالي إلى صف جديد. تنتقل درجاته معه عند النقل داخل نفس السنة.`}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label>الصفوف الحالية</Label>
                <div className="flex flex-wrap gap-1.5">
                  {students.length === 1 && students[0].currentClasses.length > 0 ? (
                    students[0].currentClasses.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                      >
                        <School className="size-3.5" /> {name}
                      </span>
                    ))
                  ) : students.length > 1 ? (
                    <span className="text-sm text-muted-foreground">{students.length} طلاب محددون</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">بدون صف</span>
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="transferTargetClass">الصف الجديد</Label>
                <select
                  id="transferTargetClass"
                  className={selectCls}
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    if (state.message) setState(initialState);
                  }}
                >
                  <option value="">اختر الصف...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.gradeLabel ? ` — ${c.gradeLabel}` : " — بدون سنة"}
                    </option>
                  ))}
                </select>
              </div>

              {target && !target.gradeLabel ? (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  ⚠️ هذا الصف بدون سنة/مرحلة محددة، لذلك لن يتم مسح أي سجل قديم. عدّل الصف من قسم «الصفوف» لتخصيص السنة.
                </p>
              ) : null}

              {isCrossYear ? (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <strong>تنبيه:</strong> النقل بين سنتين دراسيتين مختلفتين سيحذف سجل المحادثات والدرجات القديمة
                    لهذه الطلاب نهائيًا (التسليمات والرسائل والملفات المرفقة). لا يمكن التراجع.
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
              <Button type="button" onClick={handleSubmit} disabled={blocked || pending}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> جارِ التجهيز...
                  </>
                ) : (
                  "متابعة النقل"
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
