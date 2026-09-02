import ExcelJS from "exceljs";

export type Row = {
  studentName: string;
  studentCode: string;
  className: string;
  assignment: string;
  maxGrade?: string;
  status: string;
  grade: string;
  comment: string;
  dates: string;
};

export type ExportItem = {
  id?: string;
  assignment?: { title?: string; class_id?: string; max_grade?: number | null };
  student?: { full_name?: string; email?: string; code?: number };
  grade_row?: { grade?: number | null; comment?: string | null };
  submissions?: { attempt_number?: number; submitted_at?: string }[];
  status: string;
  needs_revision: boolean;
  updated_at?: string;
};

export function statusLabel(status: string, needsRevision: boolean, hasSubmission: boolean) {
  if (status === "closed") return "مكتمل";
  if (needsRevision) return "تحتاج مراجعة";
  if (!hasSubmission) return "بانتظار الطالب";
  if (status === "active") return "قيد المراجعة";
  return status;
}

export function toRow(row: ExportItem, className: string): Row {
  const grade = Array.isArray(row.grade_row) ? row.grade_row[0] : row.grade_row;
  const submissions = Array.isArray(row.submissions) ? row.submissions : [];
  const hasSubmission = submissions.length > 0;
  const lastSubmitted = submissions.length
    ? submissions.map((s) => s.submitted_at).filter(Boolean).sort().pop()
    : undefined;
  return {
    studentName: row.student?.full_name ?? "",
    studentCode: String(row.student?.code ?? ""),
    className,
    assignment: row.assignment?.title ?? "",
    maxGrade: row.assignment?.max_grade != null ? String(row.assignment.max_grade) : "",
    status: statusLabel(row.status, row.needs_revision, hasSubmission),
    grade: grade?.grade != null ? String(grade.grade) : "",
    comment: grade?.comment ?? "",
    dates: [row.updated_at, lastSubmitted].filter(Boolean).join(" / ")
  };
}

export const EXPORT_HEADERS: Array<[keyof Row, string]> = [
  ["studentName", "الطالب"],
  ["studentCode", "الكود"],
  ["className", "الصف"],
  ["assignment", "الواجب"],
  ["status", "الحالة"],
  ["grade", "الدرجة"],
  ["comment", "ملاحظة المُدرّس"],
  ["dates", "التواريخ"]
];

// ---------------------------------------------------------------------------
// Premium styled grade matrix (.xlsx)
//   Row 1   : merged banner with the class name
//   Row 2   : one block per student — name column then code column — then «المجموع»
//   Column A: homework names (rows 3+)
//   Body    : each student's grade for each homework
//   Last row: per-student totals
// ---------------------------------------------------------------------------

type StudentBlock = { name: string; code: string; grades: Map<string, number> };

function collectMatrix(rows: Row[]) {
  const students = new Map<string, StudentBlock>();
  const homeworks: string[] = [];
  const homeworkMax = new Map<string, number>();

  for (const row of rows) {
    const key = row.studentCode || row.studentName || "؟";
    if (!students.has(key)) {
      students.set(key, { name: row.studentName || key, code: row.studentCode, grades: new Map() });
    }
    const title = row.assignment || "";
    if (title && !homeworks.includes(title)) {
      homeworks.push(title);
      const parsed = Number.parseFloat(row.maxGrade ?? "");
      homeworkMax.set(title, Number.isFinite(parsed) && parsed > 0 ? parsed : 20);
    }
    const parsed = Number.parseFloat(row.grade);
    if (title && !Number.isNaN(parsed)) students.get(key)!.grades.set(title, parsed);
  }

  return { students: [...students.values()], homeworks, homeworkMax };
}

function maxOf(homeworkMax: Map<string, number>, title: string): number {
  return homeworkMax.get(title) ?? 20;
}

const P_BANNER = "1F4E79"; // deep brand blue
const P_HEADER = "2E75B6"; // medium blue
const P_CODE = "9DC3E6"; // light blue
const P_ZEBRA = "F2F8FE"; // ghost white
const P_TOTAL_GRADE = "FFE699"; // brighter gold
const P_GRID = "BFBFBF";
const GRADE_HIGH = "E2EFDA"; // soft green tint
const GRADE_MID = "FCE4D6"; // soft orange tint
const GRADE_LOW = "F8CBAD"; // soft red tint

function solid(fill: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
}

function allBorders(): ExcelJS.Borders {
  const b = { style: "thin" as ExcelJS.BorderStyle, color: { argb: `FF${P_GRID}` } };
  return { top: b, bottom: b, left: b, right: b, diagonal: {} };
}

function headerStyle(fill: string, fontColor: string, bold = true) {
  return {
    fill: solid(fill),
    font: { bold, name: "Cairo", color: { argb: `FF${fontColor}` } },
    alignment: { horizontal: "center" as const, vertical: "middle" as const },
    border: allBorders()
  };
}

function fillOf(ratio: number): string {
  if (ratio >= 0.9) return GRADE_HIGH;
  if (ratio >= 0.7) return GRADE_MID;
  return GRADE_LOW;
}

function wrapLongTitle(title: string, maxLength = 28): string {
  if (title.length <= maxLength) return title;
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/**
 * Builds a real, styled .xlsx workbook buffer from export rows.
 *
 * Layout: one row per student — name in the first column, code in the second —
 * homework names as column headers, each student's grade in the matching
 * column, and a «مجموع درجات الواجبات» total column at the end.
 */
export async function buildXlsxBuffer(rows: Row[], className = ""): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wagbati";
  wb.created = new Date();
  const ws = wb.addWorksheet("كشف الدرجات", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: "frozen", xSplit: 2, ySplit: 2, rightToLeft: true, showGridLines: false }]
  });

  const { students, homeworks, homeworkMax } = collectMatrix(rows);
  const nameCol = 1;
  const codeCol = 2;
  const lastColumn = 2 + homeworks.length + 1; // name + code + homeworks + total
  const lastColName = ws.getColumn(lastColumn).letter;
  const firstHomeworkCol = 3;
  const totalMax = homeworks.reduce((acc, title) => acc + maxOf(homeworkMax, title), 0);

  for (let i = 1; i <= lastColumn; i++) {
    ws.getColumn(i).width = i === nameCol ? 28 : i === codeCol ? 14 : i === lastColumn ? 20 : 18;
  }

  // Row 1 — banner
  ws.mergeCells(`A1:${lastColName}1`);
  const banner = ws.getCell("A1");
  banner.value = className ? `${className} — كشف درجات الواجبات` : "كشف درجات الواجبات";
  Object.assign(banner, {
    fill: solid(P_BANNER),
    font: { bold: true, size: 16, name: "Cairo", color: { argb: "FFFFFFFF" } },
    alignment: { horizontal: "right" as const, vertical: "middle" as const }
  });
  ws.getRow(1).height = 30;

  // Row 2 — headers
  const header = ws.getRow(2);
  header.height = 42;
  Object.assign(header.getCell(nameCol), { value: "الاسم", ...headerStyle(P_HEADER, "FFFFFF") });
  Object.assign(header.getCell(codeCol), { value: "الكود", ...headerStyle(P_CODE, "1F3864") });

  homeworks.forEach((title, hIndex) => {
    const col = header.getCell(firstHomeworkCol + hIndex);
    Object.assign(col, {
      value: `${wrapLongTitle(title, 16)}\n(من ${maxOf(homeworkMax, title)})`,
      ...headerStyle(P_HEADER, "FFFFFF"),
      alignment: { horizontal: "center", vertical: "middle", wrapText: true }
    });
  });
  Object.assign(header.getCell(lastColumn), {
    value: totalMax > 0 ? `مجموع درجات الواجبات\n(من ${totalMax})` : "مجموع درجات الواجبات",
    ...headerStyle(P_TOTAL_GRADE, "7F6000"),
    alignment: { horizontal: "center", vertical: "middle", wrapText: true }
  });

  if (students.length === 0) {
    ws.mergeCells(`A3:${lastColName}3`);
    const empty = ws.getCell("A3");
    empty.value = "لا توجد بيانات.";
    empty.font = { name: "Cairo", color: { argb: "FF7F7F7F" } };
    empty.alignment = { horizontal: "center", vertical: "middle" };
    return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  }

  const columnMax = homeworks.map((title) =>
    students.reduce((acc, s) => Math.max(acc, s.grades.get(title) ?? 0), 20)
  );

  // Student rows
  students.forEach((student, sIndex) => {
    const row = ws.getRow(3 + sIndex);
    row.height = 26;
    const zebraFill = sIndex % 2 === 1 ? solid(P_ZEBRA) : { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };

    Object.assign(row.getCell(nameCol), {
      value: student.name,
      fill: zebraFill,
      font: { bold: true, size: 11, name: "Cairo" },
      alignment: { horizontal: "right", vertical: "middle" },
      border: allBorders()
    });

    const cCell = row.getCell(codeCol);
    cCell.value = student.code || "";
    cCell.fill = zebraFill;
    cCell.alignment = { horizontal: "center", vertical: "middle" };
    cCell.font = { size: 11, name: "Consolas", color: { argb: "FF595959" } };
    cCell.border = allBorders();

    homeworks.forEach((title, hIndex) => {
      const grade = student.grades.get(title);
      const gCell = row.getCell(firstHomeworkCol + hIndex);
      gCell.value = grade != null ? grade : "";
      gCell.alignment = { horizontal: "center", vertical: "middle" };
      gCell.font = { size: 11, name: "Cairo", bold: grade != null };
      gCell.fill = grade != null ? solid(fillOf(grade / columnMax[hIndex])) : zebraFill;
      gCell.border = allBorders();
    });

    const total = [...student.grades.values()].reduce((a, b) => a + b, 0);
    const tCell = row.getCell(lastColumn);
    tCell.value = total > 0 ? total : "";
    tCell.alignment = { horizontal: "center", vertical: "middle" };
    tCell.font = { bold: true, name: "Cairo", color: { argb: "FF7F6000" } };
    tCell.fill = solid(P_TOTAL_GRADE);
    tCell.border = allBorders();
  });

  return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}