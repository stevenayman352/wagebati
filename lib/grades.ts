/**
 * Shared shapes and pure helpers for the admin grade sheet.
 *
 * The sheet renders the same matrix the Excel export builds (students as rows,
 * assignments as columns, a «مجموع درجات الواجبات» column at the end), so the
 * colour thresholds and the total semantics live here instead of being
 * re-derived in two places.
 */

export type GradeClassOption = {
  id: string;
  name: string;
  gradeLabel: string;
};

export type GradeSheetStudent = {
  id: string;
  name: string;
  code: string;
};

export type GradeSheetAssignment = {
  id: string;
  title: string;
  maxGrade: number;
};

/** One editable cell: the conversation that holds the grade, and its value. */
export type GradeSheetCell = {
  conversationId: string;
  grade: number | null;
};

/** Keyed by `cellKey(assignmentId, studentId)`. */
export type GradeSheetCells = Record<string, GradeSheetCell>;

export function cellKey(assignmentId: string, studentId: string): string {
  return `${assignmentId}:${studentId}`;
}

/** Arabic alphabetical order, same collator the Excel export uses. */
export const ARABIC_SORT = new Intl.Collator("ar");

export type GradeTone = "none" | "high" | "mid" | "low";

/**
 * Mirrors `fillOf()` in lib/export.ts so the screen and the exported workbook
 * colour the same mark the same way.
 */
export function gradeTone(grade: number | null, maxGrade: number): GradeTone {
  if (grade == null || !Number.isFinite(grade) || !(maxGrade > 0)) return "none";
  const ratio = grade / maxGrade;
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.7) return "mid";
  return "low";
}

export type GradeTotals = {
  /** Sum of the recorded grades. */
  sum: number;
  /** Sum of the full marks of every assignment in the class. */
  max: number;
  /** How many assignments carry a grade for this student. */
  graded: number;
  /** Percentage of `max`, rounded to one decimal. */
  percent: number;
};

export function studentTotals(
  studentId: string,
  assignments: GradeSheetAssignment[],
  values: Record<string, string>
): GradeTotals {
  let sum = 0;
  let max = 0;
  let graded = 0;

  for (const assignment of assignments) {
    max += assignment.maxGrade;
    const raw = values[cellKey(assignment.id, studentId)];
    if (raw === undefined || raw.trim() === "") continue;
    const grade = Number(raw);
    if (!Number.isFinite(grade)) continue;
    sum += grade;
    graded += 1;
  }

  const percent = max > 0 ? Math.round((sum / max) * 1000) / 10 : 0;
  return { sum, max, graded, percent };
}

/** Formats a mark without a trailing ".0" so 18 stays 18 and 17.5 stays 17.5. */
export function formatGrade(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
