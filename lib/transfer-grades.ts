import { isCrossYearTransfer } from "@/lib/transfer";

/**
 * Pure helpers for carrying a student's marks to their new class.
 *
 * A same-year transfer swaps the class_students link but the grades stay on the
 * old class's conversations. These helpers decide which old homework maps to
 * which new homework, whether the admin has to review the mapping, how a mark
 * is converted when the full mark changes, and whether a mark already recorded
 * in the new class is kept or overwritten.
 *
 * Nothing here touches the database; app/actions/admin.ts loads the rows and
 * lib/transfer-grade-data.ts applies the plan.
 */

export type GradeScaleMode = "raw" | "proportional";
export type GradeConflictPolicy = "keep" | "overwrite";

export type TransferGradePlanRow = {
  sourceAssignmentId: string;
  targetAssignmentId: string;
  scale: GradeScaleMode;
  onConflict: GradeConflictPolicy;
};

export type TransferGradePlanGroup = {
  sourceClassId: string;
  targetClassId: string;
  rows: TransferGradePlanRow[];
};

export type TransferGradePlan = TransferGradePlanGroup[];

export type PreviewSourceAssignment = {
  id: string;
  title: string;
  maxGrade: number;
  /** Selected students who have a mark on this homework: studentId → grade. */
  grades: Record<string, number>;
  /** Unique title match in the target class, or null when missing/ambiguous. */
  suggestedTargetId: string | null;
  /** Every target homework whose normalized title matches (0, 1 or more). */
  candidateTargetIds: string[];
};

export type PreviewGroup = {
  sourceClassId: string;
  sourceClassName: string;
  targetClassId: string;
  targetClassName: string;
  /** Cross-year transfers delete the old record instead of carrying marks. */
  crossYear: boolean;
  sourceAssignments: PreviewSourceAssignment[];
  targetAssignments: Array<{ id: string; title: string; maxGrade: number }>;
  /** targetAssignmentId → studentId → existing grade (selected students only). */
  targetGrades: Record<string, Record<string, number>>;
};

export type TransferGradePreview = {
  groups: PreviewGroup[];
  students: Array<{ id: string; name: string }>;
  /** True when the admin has to choose a target, a scale or a conflict policy. */
  needsReview: boolean;
  /** Best-effort mapping for the dialog's initial state. */
  autoPlan: TransferGradePlan;
};

export type GradePreviewInput = {
  target: { id: string; name: string; gradeLabel: string };
  sourceClasses: Array<{ id: string; name: string; gradeLabel: string }>;
  students: Array<{ id: string; name: string }>;
  links: Array<{ studentId: string; classId: string }>;
  sourceAssignments: Array<{ id: string; classId: string; title: string; maxGrade: number }>;
  targetAssignments: Array<{ id: string; title: string; maxGrade: number }>;
  sourceGrades: Array<{ assignmentId: string; studentId: string; grade: number }>;
  targetGrades: Array<{ assignmentId: string; studentId: string; grade: number }>;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Title comparison used for automatic matching. It tolerates the differences
 * that actually show up between two sections of the same year: Arabic letter
 * variants (أ/إ/آ, ى/ي, ة/ه), diacritics, tatweel, Arabic-Indic digits,
 * punctuation and extra spaces. It does not try to guess synonyms — those are
 * exactly the cases the admin maps by hand.
 */
export function normalizeAssignmentTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u0640/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Converts a mark to the target homework's full mark. Raw keeps the number
 * (clamped to the target maximum); proportional keeps the percentage. Both
 * round to two decimals, matching the numeric(6,2) column.
 */
export function resolveGradeValue(
  grade: number,
  sourceMax: number,
  targetMax: number,
  mode: GradeScaleMode
): number {
  const safeTarget = targetMax > 0 ? targetMax : sourceMax > 0 ? sourceMax : grade;
  let value = grade;
  if (mode === "proportional" && sourceMax > 0 && targetMax > 0) {
    value = (grade / sourceMax) * targetMax;
  }
  const rounded = Math.round(value * 100) / 100;
  return Math.max(0, Math.min(rounded, safeTarget));
}

/** Builds the preview the admin sees before the transfer is applied. */
export function buildTransferGradePreview(input: GradePreviewInput): TransferGradePreview {
  const selected = new Set(input.students.map((student) => student.id));
  const targetById = new Map(input.targetAssignments.map((assignment) => [assignment.id, assignment]));

  const linksByClass = new Map<string, Set<string>>();
  for (const link of input.links) {
    if (!selected.has(link.studentId)) continue;
    const set = linksByClass.get(link.classId) ?? new Set<string>();
    set.add(link.studentId);
    linksByClass.set(link.classId, set);
  }

  const sourceGradesByAssignment = new Map<string, Array<{ studentId: string; grade: number }>>();
  for (const grade of input.sourceGrades) {
    if (!selected.has(grade.studentId)) continue;
    const list = sourceGradesByAssignment.get(grade.assignmentId) ?? [];
    list.push({ studentId: grade.studentId, grade: grade.grade });
    sourceGradesByAssignment.set(grade.assignmentId, list);
  }

  const targetGradesByAssignment = new Map<string, Map<string, number>>();
  for (const grade of input.targetGrades) {
    if (!selected.has(grade.studentId)) continue;
    const map = targetGradesByAssignment.get(grade.assignmentId) ?? new Map<string, number>();
    map.set(grade.studentId, grade.grade);
    targetGradesByAssignment.set(grade.assignmentId, map);
  }

  const groups: PreviewGroup[] = [];
  const autoGroups = new Map<string, TransferGradePlanGroup>();
  let needsReview = false;

  for (const source of input.sourceClasses) {
    const studentIds = linksByClass.get(source.id);
    if (!studentIds || studentIds.size === 0) continue;

    const sourceAssignments: PreviewSourceAssignment[] = [];
    for (const assignment of input.sourceAssignments) {
      if (assignment.classId !== source.id) continue;

      const grades: Record<string, number> = {};
      for (const grade of sourceGradesByAssignment.get(assignment.id) ?? []) {
        if (studentIds.has(grade.studentId)) grades[grade.studentId] = grade.grade;
      }
      // A homework nobody was graded on has nothing to carry; leave it out of
      // the dialog so the admin only maps homework that actually has marks.
      if (Object.keys(grades).length === 0) continue;

      const normalized = normalizeAssignmentTitle(assignment.title);
      const candidates = input.targetAssignments.filter(
        (target) => normalizeAssignmentTitle(target.title) === normalized
      );

      sourceAssignments.push({
        id: assignment.id,
        title: assignment.title,
        maxGrade: assignment.maxGrade,
        grades,
        suggestedTargetId: candidates.length === 1 ? candidates[0].id : null,
        candidateTargetIds: candidates.map((target) => target.id)
      });
    }
    if (sourceAssignments.length === 0) continue;

    const crossYear = isCrossYearTransfer(source.gradeLabel, input.target.gradeLabel);

    const targetGrades: Record<string, Record<string, number>> = {};
    for (const [assignmentId, map] of targetGradesByAssignment) {
      const values: Record<string, number> = {};
      for (const [studentId, grade] of map) {
        if (studentIds.has(studentId)) values[studentId] = grade;
      }
      if (Object.keys(values).length > 0) targetGrades[assignmentId] = values;
    }

    groups.push({
      sourceClassId: source.id,
      sourceClassName: source.name,
      targetClassId: input.target.id,
      targetClassName: input.target.name,
      crossYear,
      sourceAssignments,
      targetAssignments: input.targetAssignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        maxGrade: assignment.maxGrade
      })),
      targetGrades
    });

    // Cross-year sources are purged; there is no mapping to choose.
    if (crossYear) continue;

    const suggestedUse = new Map<string, number>();
    for (const assignment of sourceAssignments) {
      if (!assignment.suggestedTargetId) continue;
      suggestedUse.set(
        assignment.suggestedTargetId,
        (suggestedUse.get(assignment.suggestedTargetId) ?? 0) + 1
      );
    }

    for (const assignment of sourceAssignments) {
      const suggested = assignment.suggestedTargetId
        ? targetById.get(assignment.suggestedTargetId)
        : undefined;
      const duplicateSuggestion = assignment.suggestedTargetId
        ? (suggestedUse.get(assignment.suggestedTargetId) ?? 0) > 1
        : false;
      const hasConflict = assignment.suggestedTargetId
        ? Object.keys(assignment.grades).some(
            (studentId) =>
              targetGrades[assignment.suggestedTargetId as string]?.[studentId] !== undefined
          )
        : false;

      if (
        !assignment.suggestedTargetId ||
        assignment.candidateTargetIds.length > 1 ||
        duplicateSuggestion ||
        (suggested !== undefined && suggested.maxGrade !== assignment.maxGrade) ||
        hasConflict
      ) {
        needsReview = true;
      }

      if (assignment.suggestedTargetId && suggested) {
        const key = `${source.id}:${input.target.id}`;
        const group =
          autoGroups.get(key) ??
          ({ sourceClassId: source.id, targetClassId: input.target.id, rows: [] } satisfies TransferGradePlanGroup);
        group.rows.push({
          sourceAssignmentId: assignment.id,
          targetAssignmentId: assignment.suggestedTargetId,
          scale: suggested.maxGrade !== assignment.maxGrade ? "proportional" : "raw",
          onConflict: "keep"
        });
        autoGroups.set(key, group);
      }
    }
  }

  return {
    groups,
    students: input.students.map((student) => ({ id: student.id, name: student.name })),
    needsReview,
    autoPlan: [...autoGroups.values()]
  };
}

/** Combines the per-target previews of an Excel import into one dialog payload. */
export function mergeTransferGradePreviews(previews: TransferGradePreview[]): TransferGradePreview {
  const students = new Map<string, { id: string; name: string }>();
  for (const preview of previews) {
    for (const student of preview.students) students.set(student.id, student);
  }
  return {
    groups: previews.flatMap((preview) => preview.groups),
    students: [...students.values()],
    needsReview: previews.some((preview) => preview.needsReview),
    autoPlan: previews.flatMap((preview) => preview.autoPlan)
  };
}

/**
 * Enforces the “no silent skip” rule: every homework with marks in a same-year
 * source class must have a target in the new class, and one target cannot be
 * used twice inside the same source class.
 */
export function validateGradePlan(
  plan: TransferGradePlan | null,
  preview: TransferGradePreview
): { ok: true } | { ok: false; message: string } {
  const planGroups = plan ?? [];

  for (const group of preview.groups) {
    if (group.crossYear) continue;

    const graded = group.sourceAssignments.filter(
      (assignment) => Object.keys(assignment.grades).length > 0
    );
    if (graded.length === 0) continue;

    const planGroup = planGroups.find(
      (candidate) =>
        candidate.sourceClassId === group.sourceClassId &&
        candidate.targetClassId === group.targetClassId
    );
    if (!planGroup) {
      return {
        ok: false,
        message: `حدد الواجب المقابل لواجبات صف «${group.sourceClassName}».`
      };
    }

    const targetIds = new Set(group.targetAssignments.map((target) => target.id));
    const sourceIds = new Set(group.sourceAssignments.map((assignment) => assignment.id));
    const seenSources = new Set<string>();

    for (const row of planGroup.rows) {
      if (!sourceIds.has(row.sourceAssignmentId)) {
        return {
          ok: false,
          message: "الخطة تحتوي على واجب لا ينتمي إلى الصف القديم."
        };
      }
      if (seenSources.has(row.sourceAssignmentId)) {
        return {
          ok: false,
          message: "الخطة تحتوي على أكثر من سطر لنفس الواجب القديم."
        };
      }
      seenSources.add(row.sourceAssignmentId);
    }

    for (const assignment of graded) {
      const row = planGroup.rows.find(
        (candidate) => candidate.sourceAssignmentId === assignment.id
      );
      if (!row) {
        return {
          ok: false,
          message: `حدد الواجب المقابل لـ «${assignment.title}» في «${group.targetClassName}».`
        };
      }
      if (!targetIds.has(row.targetAssignmentId)) {
        return {
          ok: false,
          message: `الواجب المختار لـ «${assignment.title}» غير موجود في الصف الجديد.`
        };
      }

      if (row.scale !== "raw" && row.scale !== "proportional") {
        return { ok: false, message: "طريقة نقل الدرجة غير صالحة." };
      }
      if (row.onConflict !== "keep" && row.onConflict !== "overwrite") {
        return { ok: false, message: "طريقة معالجة الدرجة الموجودة غير صالحة." };
      }
    }
  }

  return { ok: true };
}

/** Parses the mapping JSON sent by the browser; null when absent/malformed. */
export function parseGradePlan(raw: unknown): TransferGradePlan | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;

  const plan: TransferGradePlan = [];
  for (const group of value) {
    if (!group || typeof group !== "object") return null;
    const record = group as Record<string, unknown>;
    if (
      typeof record.sourceClassId !== "string" ||
      typeof record.targetClassId !== "string" ||
      !Array.isArray(record.rows)
    ) {
      return null;
    }

    const rows: TransferGradePlanRow[] = [];
    for (const row of record.rows) {
      if (!row || typeof row !== "object") return null;
      const entry = row as Record<string, unknown>;
      if (
        typeof entry.sourceAssignmentId !== "string" ||
        typeof entry.targetAssignmentId !== "string" ||
        (entry.scale !== "raw" && entry.scale !== "proportional") ||
        (entry.onConflict !== "keep" && entry.onConflict !== "overwrite")
      ) {
        return null;
      }
      rows.push({
        sourceAssignmentId: entry.sourceAssignmentId,
        targetAssignmentId: entry.targetAssignmentId,
        scale: entry.scale,
        onConflict: entry.onConflict
      });
    }

    plan.push({
      sourceClassId: record.sourceClassId,
      targetClassId: record.targetClassId,
      rows
    });
  }

  return plan;
}
