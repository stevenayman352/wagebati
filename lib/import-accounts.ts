import type { AppRole } from "@/lib/types";

export type ImportColumn = "code" | "name" | "role" | "class" | "password";

export type ImportIssue = {
  row: number;
  column: ImportColumn | "file";
  message: string;
};

export type ParsedImportRow = {
  row: number;
  code: string;
  name: string;
  role: string;
  className: string;
  password: string;
};

export type ValidImportRow = {
  row: number;
  code: string;
  name: string;
  role: AppRole;
  className: string | null;
  password: string;
};

export type ImportParseResult = {
  rows: ParsedImportRow[];
  headerError?: string;
  fileError?: string;
};

export type ImportValidationOptions = {
  existingCodes: Iterable<string>;
  classNames: Iterable<string>;
};

export type ImportValidationResult = {
  valid: ValidImportRow[];
  issues: ImportIssue[];
};

export type Workbook = ReturnType<typeof import("xlsx").read>;

export const IMPORT_COLUMN_LABELS: Record<ImportColumn, string> = {
  code: "code",
  name: "name",
  role: "role",
  class: "class",
  password: "startup password"
};

const HEADER_ALIASES: Record<ImportColumn, readonly string[]> = {
  code: ["code", "الكود", "كود", "الكود الرقمي"],
  name: ["name", "الاسم", "الاسم الكامل", "full name"],
  role: ["role", "الدور", "الوظيفة", "نوع الحساب"],
  class: ["class", "الصف", "الفصل", "class name", "اسم الصف", "الصف الدراسي"],
  password: ["startup password", "password", "كلمة المرور", "كلمة المرور الأولية", "كلمة السر الأولية"]
};

const ROLE_ALIASES: Record<AppRole, readonly string[]> = {
  admin: ["admin", "مدير", "ادمن", "مشرف"],
  teacher: ["teacher", "معلم", "مُعلّم", "مدرس", "أستاذ", "استاذ"],
  student: ["student", "طالب", "تلميذ"]
};

const CODE_PATTERN = /^[a-z0-9]{4,24}$/;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Parses the FIRST sheet of an uploaded workbook as accounts data. Handles
 * English and Arabic headers in any order and preserves real Excel row
 * numbers so issues can be reported as "row X, column Y".
 *
 * Security note: this parses untrusted files, so it is guarded by an admin
 * role, file-size limits, a row cap, and a try/catch around xlsx.read.
 */
export async function parseImportFile(data: ArrayBuffer | Uint8Array): Promise<ImportParseResult> {
  let wb: Workbook | null = null;
  try {
    const { read } = await import("xlsx");
    const type = ArrayBuffer.isView(data) ? "buffer" : "array";
    wb = read(data, { type });
  } catch {
    return { rows: [], fileError: "تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح (xlsx/xls)." };
  }

  return parseWorkbook(wb);
}

async function parseWorkbook(wb: Workbook | null): Promise<ImportParseResult> {
  const sheetName = wb?.SheetNames?.[0];
  const sheet = sheetName ? wb?.Sheets?.[sheetName] : undefined;
  if (!sheetName || !sheet) return { rows: [], fileError: "الملف لا يحتوي على أوراق بيانات." };

  const { utils } = await import("xlsx");
  const aoa = utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (aoa.length <= 1) return { rows: [] };

  const columnIndexes = detectColumnIndexes(aoa[0]);
  const missing = (Object.keys(columnIndexes) as ImportColumn[]).filter((col) => columnIndexes[col] < 0);
  if (missing.length > 0) {
    const labels = missing.map((col) => `«${IMPORT_COLUMN_LABELS[col]}»`).join("، ");
    return { rows: [], headerError: `الأعمدة المطلوبة غير موجودة في أول ورقة: ${labels}` };
  }

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] ?? [];
    if (cells.every((c) => c === "" || c === null || c === undefined)) continue;
    const pick = (col: ImportColumn) => toCellText(cells[columnIndexes[col]]);

    rows.push({
      row: i + 1,
      code: pick("code").toLowerCase(),
      name: pick("name"),
      role: pick("role").toLowerCase(),
      className: pick("class"),
      password: pick("password")
    });
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], fileError: `عدد الصفوف يتجاوز الحد المسموح (${MAX_IMPORT_ROWS}).` };
  }

  return { rows };
}

function detectColumnIndexes(headerRow: unknown[]): Record<ImportColumn, number> {
  const result = {} as Record<ImportColumn, number>;
  const headerCells = (headerRow ?? []).map((cell) => normalizeHeader(toCellText(cell)));

  (Object.keys(HEADER_ALIASES) as ImportColumn[]).forEach((col) => {
    const index = headerCells.findIndex((h) => HEADER_ALIASES[col].includes(h));
    result[col] = index;
  });
  return result;
}

/**
 * Validates parsed rows against app rules and live data. A row that touches
 * any invalid column is rejected (account is not created) with the column and
 * Excel row number reported for each problem. Empty class cells are fine
 * (account created without a class link); a non-empty class must exist.
 */
export function validateImportRows(
  rows: ParsedImportRow[],
  options: ImportValidationOptions
): ImportValidationResult {
  const existing = new Set(Array.from(options.existingCodes, (c) => c.trim().toLowerCase()));
  const classes = new Set(Array.from(options.classNames, (c) => c.trim().toLowerCase()));

  const seenCodes = new Set<string>();
  const valid: ValidImportRow[] = [];
  const issues: ImportIssue[] = [];

  for (const row of rows) {
    const rowIssues: ImportIssue[] = [];

    if (!CODE_PATTERN.test(row.code)) {
      rowIssues.push({ row: row.row, column: "code", message: "كود غير صالح (٤-٢٤ حرفًا أبجديًا رقميًا بحروف إنجليزية)." });
    } else if (existing.has(row.code) || seenCodes.has(row.code)) {
      rowIssues.push({ row: row.row, column: "code", message: "الكود مستخدم بالفعل." });
    }

    if (row.name.length < 2 || row.name.length > 120) {
      rowIssues.push({ row: row.row, column: "name", message: "الاسم مطلوب (٢-١٢٠ حرفًا)." });
    }

    const role = resolveRole(row.role);
    if (!role) {
      rowIssues.push({ row: row.row, column: "role", message: "الدور غير صالح (student / teacher / admin فقط)." });
    }

    if (row.password.length < 8) {
      rowIssues.push({ row: row.row, column: "password", message: "كلمة المرور قصيرة (٨ أحرف على الأقل)." });
    }

    let resolvedClass: string | null = null;
    const className = row.className.trim();
    if (className !== "") {
      const normalized = className.toLowerCase();
      const match = Array.from(classes).find((c) => c === normalized);
      if (!match) {
        rowIssues.push({ row: row.row, column: "class", message: `الصف «${className}» غير موجود في النظام.` });
      } else {
        resolvedClass = className;
      }
    }

    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      continue;
    }

    if (!role) continue;
    seenCodes.add(row.code);
    valid.push({
      row: row.row,
      code: row.code,
      name: row.name,
      role,
      className: resolvedClass,
      password: row.password
    });
  }

  return { valid, issues };
}

function resolveRole(raw: string): AppRole | null {
  const normalized = normalizeHeader(raw);
  for (const role of Object.keys(ROLE_ALIASES) as AppRole[]) {
    if (ROLE_ALIASES[role].includes(normalized)) return role;
  }
  return null;
}

/**
 * Builds the 2-sheet import template: sheet 1 carries the empty account
 * columns, sheet 2 lists every existing class in its own cell so the admin can
 * copy an exact class name and paste it into the class column (no typos).
 */
export async function buildAccountTemplateBuffer(classes: string[]): Promise<ArrayBuffer> {
  const { utils, write } = await import("xlsx");

  const accountsHeader = ["code", "name", "role", "class", "startup password"];
  const accountsSheet = utils.aoa_to_sheet([accountsHeader]);
  accountsSheet["!cols"] = accountsHeader.map((label) => ({ wch: Math.max(14, label.length + 4) }));

  const classesAoa: unknown[][] = [["الصفوف المتاحة — انسخ اسم الصف والصقه في عمود class"]];
  for (const name of classes) classesAoa.push([name]);
  const classesSheet = utils.aoa_to_sheet(classesAoa);
  classesSheet["!cols"] = [{ wch: 40 }];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, accountsSheet, "الحسابات");
  utils.book_append_sheet(wb, classesSheet, "الصفوف");
  return write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
}