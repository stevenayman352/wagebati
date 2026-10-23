"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatGrade } from "@/lib/grades";
import {
  resolveGradeValue,
  type GradeConflictPolicy,
  type GradeScaleMode,
  type PreviewGroup,
  type PreviewSourceAssignment,
  type TransferGradePlan,
  type TransferGradePreview
} from "@/lib/transfer-grades";
import { AlertTriangle, ArrowRightLeft, Check, Loader2 } from "lucide-react";

type RowState = {
  targetId: string;
  scale: GradeScaleMode;
  onConflict: GradeConflictPolicy;
};

type Props = {
  preview: TransferGradePreview;
  pending?: boolean;
  /** Server-side validation message (shown under the rows). */
  error?: string | null;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (plan: TransferGradePlan) => void;
};

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

function rowKey(group: PreviewGroup, sourceAssignmentId: string): string {
  return `${group.sourceClassId}:${group.targetClassId}:${sourceAssignmentId}`;
}

function initialRows(preview: TransferGradePreview): Record<string, RowState> {
  const auto = new Map<
    string,
    { targetAssignmentId: string; scale: GradeScaleMode; onConflict: GradeConflictPolicy }
  >();
  for (const group of preview.autoPlan) {
    for (const row of group.rows) {
      auto.set(`${group.sourceClassId}:${group.targetClassId}:${row.sourceAssignmentId}`, row);
    }
  }

  const rows: Record<string, RowState> = {};
  for (const group of preview.groups) {
    if (group.crossYear) continue;
    for (const assignment of group.sourceAssignments) {
      const suggested = auto.get(rowKey(group, assignment.id));
      rows[rowKey(group, assignment.id)] = suggested
        ? {
            targetId: suggested.targetAssignmentId,
            scale: suggested.scale,
            onConflict: suggested.onConflict
          }
        : { targetId: "", scale: "proportional", onConflict: "keep" };
    }
  }
  return rows;
}

/**
 * Mapping step shared by the two transfer dialogs and the Excel import.
 *
 * One card per old homework that has marks. The admin picks the matching new
 * homework, chooses whether the number stays the same or is scaled to the new
 * full mark, and decides what happens when the new homework already has a
 * mark. Nothing is applied until every old homework has a target.
 */
export function GradeMappingForm({
  preview,
  pending = false,
  error = null,
  confirmLabel = "تأكيد النقل",
  onCancel,
  onConfirm
}: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(preview));

  const studentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of preview.students) map.set(student.id, student.name);
    return map;
  }, [preview.students]);

  const setRow = (key: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const { missing, duplicates } = useMemo(() => {
    let missingCount = 0;
    let duplicateCount = 0;
    for (const group of preview.groups) {
      if (group.crossYear) continue;
      const used = new Set<string>();
      for (const assignment of group.sourceAssignments) {
        const row = rows[rowKey(group, assignment.id)];
        if (!row?.targetId) {
          missingCount += 1;
          continue;
        }
        if (used.has(row.targetId)) duplicateCount += 1;
        else used.add(row.targetId);
      }
    }
    return { missing: missingCount, duplicates: duplicateCount };
  }, [preview.groups, rows]);

  const buildPlan = (): TransferGradePlan =>
    preview.groups
      .filter((group) => !group.crossYear)
      .map((group) => ({
        sourceClassId: group.sourceClassId,
        targetClassId: group.targetClassId,
        rows: group.sourceAssignments.map((assignment) => {
          const row = rows[rowKey(group, assignment.id)];
          return {
            sourceAssignmentId: assignment.id,
            targetAssignmentId: row.targetId,
            scale: row.scale,
            onConflict: row.onConflict
          };
        })
      }))
      .filter((group) => group.rows.length > 0);

  const canConfirm = missing === 0 && !pending;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        درجات الطالب في الصف القديم ستنتقل معه. راجع الواجب المقابل لكل واجب، واختر طريقة نقل الدرجة
        عند اختلاف الدرجة العظمى، وحدد ماذا يحدث إذا كانت الدرجة موجودة بالفعل في الصف الجديد.
      </p>

      <div className="grid max-h-[55vh] gap-4 overflow-y-auto pe-1">
        {preview.groups.length === 0 ? (
          <p className="rounded-xl border border-border/70 bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
            لا توجد درجات لنقلها. اضغط «{confirmLabel}» للمتابعة.
          </p>
        ) : null}

        {preview.groups.map((group) => (
          <section key={`${group.sourceClassId}:${group.targetClassId}`} className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
              <ArrowRightLeft className="size-4 shrink-0 text-primary" />
              <p className="text-sm font-bold">
                من «{group.sourceClassName}» إلى «{group.targetClassName}»
              </p>
            </div>

            {group.crossYear ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  انتقال بين سنتين مختلفتين: سجل الدرجات القديم سيُمسح نهائيًا ولا يحتاج إلى مطابقة.
                </p>
              </div>
            ) : group.targetAssignments.length === 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  لا توجد واجبات منشورة في «{group.targetClassName}» حتى الآن. انشر واجبات الصف الجديد
                  أولًا ثم أعد المحاولة.
                </p>
              </div>
            ) : (
              group.sourceAssignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  group={group}
                  assignment={assignment}
                  row={rows[rowKey(group, assignment.id)]}
                  studentNames={studentNames}
                  onChange={(patch) => setRow(rowKey(group, assignment.id), patch)}
                />
              ))
            )}
          </section>
        ))}
      </div>

      {missing > 0 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          متبقٍ {missing} واجب بدون واجب مقابل. لا يمكن النقل قبل تحديد الجميع.
        </p>
      ) : null}

      {duplicates > 0 ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          يوجد واجب جديد مختار لأكثر من واجب قديم. سيُعتمد اختيار واحد فقط لكل واجب جديد عند الحفظ
          (آخر اختيار في الترتيب).
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          رجوع
        </Button>
        <Button type="button" onClick={() => onConfirm(buildPlan())} disabled={!canConfirm}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> جارِ النقل...
            </>
          ) : (
            <>
              <Check className="size-4" /> {confirmLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function AssignmentCard({
  group,
  assignment,
  row,
  studentNames,
  onChange
}: {
  group: PreviewGroup;
  assignment: PreviewSourceAssignment;
  row: RowState | undefined;
  studentNames: Map<string, string>;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const target = group.targetAssignments.find((candidate) => candidate.id === row?.targetId);
  const conflictIds = target
    ? Object.keys(assignment.grades).filter(
        (studentId) => group.targetGrades[target.id]?.[studentId] !== undefined
      )
    : [];
  const exampleId = Object.keys(assignment.grades)[0];
  const exampleValue =
    target && exampleId
      ? resolveGradeValue(
          assignment.grades[exampleId],
          assignment.maxGrade,
          target.maxGrade,
          row?.scale ?? "proportional"
        )
      : null;

  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{assignment.title}</p>
          <p className="text-xs text-muted-foreground">
            الدرجة العظمى {formatGrade(assignment.maxGrade)} · {Object.keys(assignment.grades).length}{" "}
            درجة
          </p>
        </div>
        {assignment.candidateTargetIds.length > 1 ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
            أكثر من واجب بنفس الاسم
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>الواجب في الصف الجديد</Label>
          <select
            className={selectCls}
            value={row?.targetId ?? ""}
            onChange={(event) => onChange({ targetId: event.target.value })}
          >
            <option value="">اختر الواجب...</option>
            {group.targetAssignments.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title} — من {formatGrade(candidate.maxGrade)}
              </option>
            ))}
          </select>
        </div>

        {target ? (
          <div className="grid gap-1">
            <Label>طريقة نقل الدرجة</Label>
            <select
              className={selectCls}
              value={row?.scale ?? "proportional"}
              onChange={(event) => onChange({ scale: event.target.value as GradeScaleMode })}
            >
              <option value="proportional">بالتناسب مع الدرجة العظمى</option>
              <option value="raw">نفس الدرجة</option>
            </select>
            {exampleId && exampleValue !== null ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                مثال: {formatGrade(assignment.grades[exampleId])} من{" "}
                {formatGrade(assignment.maxGrade)} ← {formatGrade(exampleValue)} من{" "}
                {formatGrade(target.maxGrade)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {target && conflictIds.length > 0 ? (
        <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
          <p className="text-xs font-bold text-warning">
            يوجد درجة مسجلة لـ {conflictIds.length} طالب في هذا الواجب بالصف الجديد.
          </p>
          <select
            className={`${selectCls} mt-1.5`}
            value={row?.onConflict ?? "keep"}
            onChange={(event) =>
              onChange({ onConflict: event.target.value as GradeConflictPolicy })
            }
          >
            <option value="keep">الإبقاء على الدرجة الموجودة</option>
            <option value="overwrite">استبدالها بالدرجة المنقولة</option>
          </select>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] font-semibold text-warning">
              عرض الطلاب المتأثرين
            </summary>
            <ul className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
              {conflictIds.map((studentId) => {
                const existing = group.targetGrades[target.id]?.[studentId] ?? 0;
                const transferred = resolveGradeValue(
                  assignment.grades[studentId],
                  assignment.maxGrade,
                  target.maxGrade,
                  row?.scale ?? "proportional"
                );
                return (
                  <li key={studentId}>
                    {studentNames.get(studentId) ?? studentId}: الموجودة {formatGrade(existing)} ←
                    المنقولة {formatGrade(transferred)}
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  );
}
