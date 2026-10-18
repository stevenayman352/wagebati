import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from "@/lib/import-accounts";

/**
 * Student class transfers (admin-only).
 *
 * Rules:
 *   - Same year (equal non-empty grade_label on both classes) → only the
 *     class_students link is swapped; the old conversations/grades stay.
 *   - Cross-year (both labels set and different) → the old class conversations
 *     for that student are deleted too (grades reset for the new year).
 *   - A missing label on either side is treated as "same year" so a transfer
 *     never destroys data by accident.
 */

export type TransferColumn = "code" | "from" | "to";

export type TransferIssue = {
  row: number;
  column: TransferColumn | "file";
  message: string;
};

export type ParsedTransferRow = {
  row: number;
  code: string;
  fromClass: string;
  toClass: string;
};

export type TransferClass = {
  id: string;
  name: string;
  gradeLabel: string;
};

export type ValidTransferRow = {
  row: number;
  code: string;
  studentId: string;
  studentName: string;
  fromClassId: string;
  fromClassName: string;
  toClassId: string;
  toClassName: string;
  crossYear: boolean;
};

export type TransferParseResult = {
  rows: ParsedTransferRow[];
  headerError?: string;
  fileError?: string;
};

export type TransferValidationOptions = {
  /** Every student account: id + code + name (teachers/admins excluded). */
  students: Array<{ id: string; code: string; name: string }>;
  classes: TransferClass[];
  /** class_students links as "studentId" → class ids. */
  links: Array<{ studentId: string; classId: string }>;
};

export type TransferValidationResult = {
  valid: ValidTransferRow[];
  issues: TransferIssue[];
};

export type TransferWorkbook = ReturnType<typeof import("xlsx").read>;

export const TRANSFER_COLUMN_LABELS: Record<TransferColumn, string> = {
  code: "code",
  from: "old class",
  to: "new class"
};

const TRANSFER_HEADER_ALIASES: Record<TransferColumn, readonly string[]> = {
  code: ["code", "الكود", "كود", "الكود الرقمي"],
  from: [
    "old class",
    "from class",
    "الصف القديم",
    "الصف الحالي",
    "الصف السابق",
    "صف قديم",
    "الصف الماضي"
  ],
  to: [
    "new class",
    "to class",
    "الصف الجديد",
    "الصف المستقبل",
    "الصف الانتقال إليه",
    "صف جديد",
    "الصف الجديد"]
};

const CODE_PATTERN = /^[a-z0-9]{4,24}$/;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeClassName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True only when both classes carry a year label and the labels differ —
 * e.g. «سنة اولى بنين» → «سنة ثانية بنين». Anything else (missing label on
 * either side, or equal labels like A → B sections) keeps the grades.
 */
export function isCrossYearTransfer(sourceGradeLabel: string | null | undefined, targetGradeLabel: string | null | undefined): boolean {
  const source = (sourceGradeLabel ?? "").trim();
  const target = (targetGradeLabel ?? "").trim();
  if (!source || !target) return false;
  return normalizeClassName(source) !== normalizeClassName(target);
}

/**
 * Parses the FIRST sheet of an uploaded workbook as transfer rows. Handles
 * English and Arabic headers in any order and preserves real Excel row numbers
 * so issues can be reported as "row X, column Y".
 *
 * Security note: this parses untrusted files, so it is guarded by an admin
 * role, file-size limits, a row cap, and a try/catch around xlsx.read.
 */
export async function parseTransferFile(data: ArrayBuffer | Uint8Array): Promise<TransferParseResult> {
  let wb: TransferWorkbook | null = null;
  try {
    const { read } = await import("xlsx");
    const type = ArrayBuffer.isView(data) ? "buffer" : "array";
    wb = read(data, { type });
  } catch {
    return { rows: [], fileError: "تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح (xlsx/xls)." };
  }

  return parseTransferWorkbook(wb);
}

async function parseTransferWorkbook(wb: TransferWorkbook | null): Promise<TransferParseResult> {
  const sheetName = wb?.SheetNames?.[0];
  const sheet = sheetName ? wb?.Sheets?.[sheetName] : undefined;
  if (!sheetName || !sheet) return { rows: [], fileError: "الملف لا يحتوي على أوراق بيانات." };

  const { utils } = await import("xlsx");
  const aoa = utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (aoa.length <= 1) return { rows: [] };

  const columnIndexes = detectTransferColumnIndexes(aoa[0]);
  const missing = (Object.keys(columnIndexes) as TransferColumn[]).filter((col) => columnIndexes[col] < 0);
  if (missing.length > 0) {
    const labels = missing.map((col) => `«${TRANSFER_COLUMN_LABELS[col]}»`).join("، ");
    return { rows: [], headerError: `الأعمدة المطلوبة غير موجودة في أول ورقة: ${labels}` };
  }

  const rows: ParsedTransferRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    if (cells.every((c) => c === "" || c === null || c === undefined)) continue;
    const pick = (col: TransferColumn) => toCellText(cells[columnIndexes[col]]);

    rows.push({
      row: i + 1,
      code: pick("code").toLowerCase(),
      fromClass: pick("from"),
      toClass: pick("to")
    });
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], fileError: `عدد الصفوف يتجاوز الحد المسموح (${MAX_IMPORT_ROWS}).` };
  }

  return { rows };
}

function detectTransferColumnIndexes(headerRow: unknown[]): Record<TransferColumn, number> {
  const result = {} as Record<TransferColumn, number>;
  const headerCells = (headerRow ?? []).map((cell) => normalizeHeader(toCellText(cell)));

  (Object.keys(TRANSFER_HEADER_ALIASES) as TransferColumn[]).forEach((col) => {
    const index = headerCells.findIndex((h) => TRANSFER_HEADER_ALIASES[col].includes(h));
    result[col] = index;
  });
  return result;
}

/**
 * Validates parsed transfer rows against app rules and live data. A row that
 * touches any invalid column is rejected (nothing is transferred) with the
 * column and Excel row number reported for each problem.
 */
export function validateTransferRows(
  rows: ParsedTransferRow[],
  options: TransferValidationOptions
): TransferValidationResult {
  const studentsByCode = new Map<string, { id: string; name: string }>();
  for (const student of options.students) {
    const key = student.code.trim().toLowerCase();
    if (key) studentsByCode.set(key, { id: student.id, name: student.name });
  }

  const classesByName = new Map<string, TransferClass>();
  for (const klass of options.classes) {
    const key = normalizeClassName(klass.name);
    if (key) classesByName.set(key, klass);
  }

  const classesByStudent = new Map<string, Set<string>>();
  for (const link of options.links) {
    const set = classesByStudent.get(link.studentId) ?? new Set<string>();
    set.add(link.classId);
    classesByStudent.set(link.studentId, set);
  }

  const seenCodes = new Set<string>();
  const valid: ValidTransferRow[] = [];
  const issues: TransferIssue[] = [];

  for (const row of rows) {
    const rowIssues: TransferIssue[] = [];

    const student = studentsByCode.get(row.code);
    if (!CODE_PATTERN.test(row.code)) {
      rowIssues.push({ row: row.row, column: "code", message: "كود غير صالح (٤-٢٤ حرفًا أبجديًا رقميًا بحروف إنجليزية)." });
    } else if (!student) {
      rowIssues.push({ row: row.row, column: "code", message: "لا يوجد طالب بهذا الكود." });
    } else if (seenCodes.has(row.code)) {
      rowIssues.push({ row: row.row, column: "code", message: "الكود مكرر في الملف." });
    }

    const from = classesByName.get(normalizeClassName(row.fromClass));
    if (!row.fromClass) {
      rowIssues.push({ row: row.row, column: "from", message: "الصف القديم مطلوب." });
    } else if (!from) {
      rowIssues.push({ row: row.row, column: "from", message: `الصف «${row.fromClass}» غير موجود في النظام.` });
    }

    const to = classesByName.get(normalizeClassName(row.toClass));
    if (!row.toClass) {
      rowIssues.push({ row: row.row, column: "to", message: "الصف الجديد مطلوب." });
    } else if (!to) {
      rowIssues.push({ row: row.row, column: "to", message: `الصف «${row.toClass}» غير موجود في النظام.` });
    }

    if (student && from && to) {
      if (from.id === to.id) {
        rowIssues.push({ row: row.row, column: "to", message: "الصف القديم والجديد متطابقان." });
      } else if (!classesByStudent.get(student.id)?.has(from.id)) {
        rowIssues.push({ row: row.row, column: "from", message: "الطالب غير مرتبط بالصف القديم حاليًا." });
      }
    }

    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      continue;
    }

    if (!student || !from || !to) continue;
    seenCodes.add(row.code);
    valid.push({
      row: row.row,
      code: row.code,
      studentId: student.id,
      studentName: student.name,
      fromClassId: from.id,
      fromClassName: from.name,
      toClassId: to.id,
      toClassName: to.name,
      crossYear: isCrossYearTransfer(from.gradeLabel, to.gradeLabel)
    });
  }

  return { valid, issues };
}

/**
 * Builds the 2-sheet transfer template: sheet 1 carries the empty transfer
 * columns, sheet 2 lists every existing class with its year label so the admin
 * can copy an exact class name and paste it (no typos).
 */
export async function buildTransferTemplateBuffer(classes: TransferClass[]): Promise<ArrayBuffer> {
  const { utils, write } = await import("xlsx");

  const header = ["code", "old class", "new class"];
  const sheet = utils.aoa_to_sheet([header]);
  sheet["!cols"] = header.map((label) => ({ wch: Math.max(16, label.length + 4) }));

  const classesAoa: unknown[][] = [
    ["الصف", "السنة/المرحلة"],
    ["الصفوف المتاحة — انسخ اسم الصف والصقه في عمود old class و new class", ""]
  ];
  for (const klass of classes) classesAoa.push([klass.name, klass.gradeLabel]);
  const classesSheet = utils.aoa_to_sheet(classesAoa);
  classesSheet["!cols"] = [{ wch: 32 }, { wch: 24 }];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, sheet, "النقل");
  utils.book_append_sheet(wb, classesSheet, "الصفوف");
  return write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
}

export const MAX_TRANSFER_FILE_BYTES = MAX_IMPORT_FILE_BYTES;
