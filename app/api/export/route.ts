import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { jsPDF } from "jspdf";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { toRow, buildXlsxBuffer, type Row } from "@/lib/export";
import type { Profile } from "@/lib/types";
import type { ExportItem } from "@/lib/export";
import { rateLimit } from "@/lib/rate-limit";
import { shapeReorder, BIDI_PASSTHROUGH, disableArabicProcessing } from "@/lib/pdf-arabic";

type DB = ReturnType<typeof createSupabaseAdminClient>;

// ---------------------------------------------------------------------------
// Font / image loading (cached base64, embedded into the PDF)
// ---------------------------------------------------------------------------

const fontCache = new Map<string, string>();
function fontBase64(file: string): string {
  if (!fontCache.has(file)) {
    fontCache.set(file, readFileSync(path.join(process.cwd(), "public", "fonts", file)).toString("base64"));
  }
  return fontCache.get(file)!;
}

const imageCache = new Map<string, string>();
function imageBase64(file: string): string {
  if (!imageCache.has(file)) {
    imageCache.set(file, readFileSync(path.join(process.cwd(), "public", file)).toString("base64"));
  }
  return imageCache.get(file)!;
}

function exportTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = d.getHours();
  const ampm = hours >= 12 ? "م" : "ص";
  const h12 = hours % 12 || 12;
  const body = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(h12)}:${pad(d.getMinutes())} ${ampm}`;
  return body;
}

async function classNameOf(supabase: DB, classId?: string, studentId?: string): Promise<string> {
  if (classId) {
    const { data } = await supabase.from("classes").select("name").eq("id", classId).single();
    return data?.name ?? "";
  }
  const { data } = await supabase
    .from("class_students")
    .select("class:classes(name)")
    .eq("student_id", studentId ?? "")
    .limit(1)
    .maybeSingle();
  const cls = data?.class as unknown as { name?: string } | undefined;
  return cls?.name ?? "";
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const rl = rateLimit({ request, max: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) }
    });
  }

  const params = request.nextUrl.searchParams;
  const target = params.get("target");
  const format = params.get("format");
  const id = params.get("id");

  if (!["class", "student"].includes(target ?? "") || !["xlsx", "pdf"].includes(format ?? "") || !id) {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const allowed = await canExportTarget(supabase, profile, target as "class" | "student", id);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const className = await classNameOf(supabase, target === "class" ? id : undefined, target === "student" ? id : undefined);
  const rows = target === "class" ? await classRows(admin, id, className) : await studentRows(admin, id, className);
  if (rows.error) return new Response(rows.error, { status: 403 });

  const fileBase =
    target === "class"
      ? `تقرير-صف-${className || id.slice(0, 8)}`
      : `تقرير واجبات الطالب ${(rows.data[0]?.studentName?.trim() || className || "").replace(/[\\/:*?"<>|]+/g, "_")}`.trim();

  if (format === "xlsx") {
    const buffer = await buildXlsxBuffer(rows.data, className);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${encodeURIComponent(fileBase)}.xlsx"`
      }
    });
  }

  const pdf = target === "student" ? buildStudentPdf(rows.data) : buildClassPdf(rows.data, fileBase);
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${encodeURIComponent(fileBase)}.pdf"`
    }
  });
}

async function canExportTarget(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profile: Profile,
  target: "class" | "student",
  id: string
) {
  if (profile.role === "admin") return true;

  if (target === "class") {
    const { data } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("class_id", id)
      .eq("teacher_id", profile.id)
      .maybeSingle();
    return Boolean(data);
  }

  if (profile.id === id) return true;

  if (profile.role === "teacher") {
    const [{ data: studentClasses }, { data: myClasses }] = await Promise.all([
      supabase.from("class_students").select("class_id").eq("student_id", id),
      supabase.from("class_teachers").select("class_id").eq("teacher_id", profile.id)
    ]);
    const studentSet = new Set((studentClasses ?? []).map((row) => row.class_id));
    const overlap = (myClasses ?? []).some((row) => studentSet.has(row.class_id));
    return overlap;
  }

  return false;
}

async function classRows(supabase: DB, classId: string, className: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, status, updated_at, " +
      "grade_row:grades!grades_conversation_id_fkey(grade, comment), " +
      "submissions:submissions!submissions_conversation_id_fkey(attempt_number, submitted_at), " +
      "student:profiles!conversations_student_id_fkey(full_name, code), " +
      "assignment:assignments!inner(title, max_grade)"
    )
    .eq("assignment.class_id", classId)
    .order("updated_at", { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: (data ?? []).map((row) => toRow(row as unknown as ExportItem, className)) };
}

async function studentRows(supabase: DB, studentId: string, className: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, status, updated_at, " +
      "grade_row:grades!grades_conversation_id_fkey(grade, comment), " +
      "submissions:submissions!submissions_conversation_id_fkey(attempt_number, submitted_at), " +
      "student:profiles!conversations_student_id_fkey(full_name, code), " +
      "assignment:assignments(title, max_grade)"
    )
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: (data ?? []).map((row) => toRow(row as unknown as ExportItem, className)) };
}

// ---------------------------------------------------------------------------
// Class summary PDF (kept close to the original text layout)
// ---------------------------------------------------------------------------

function buildClassPdf(rows: Row[], fileBase: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  disableArabicProcessing(doc as Parameters<typeof disableArabicProcessing>[0]);
  doc.addFileToVFS("Cairo-Regular.ttf", fontBase64("Cairo-Regular.ttf"));
  doc.addFont("Cairo-Regular.ttf", "Cairo", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 19;

  let y: number;
  const drawPageTitle = () => {
    doc.setFont("Cairo", "normal");
    doc.setFontSize(19);
    doc.text(shapeReorder(doc, `${fileBase} — صفحة ${doc.getNumberOfPages()}`), pageWidth - margin, 40, { align: "right", ...BIDI_PASSTHROUGH });
  };

  drawPageTitle();
  y = 70;

  if (!rows.length) {
    doc.setFont("Cairo", "normal");
    doc.setFontSize(13);
    doc.text(shapeReorder(doc, "لا توجد بيانات."), pageWidth - margin, y, { align: "right", ...BIDI_PASSTHROUGH });
  }

  const fields: Array<[string, keyof Row]> = [
    ["الطالب", "studentName"],
    ["الكود", "studentCode"],
    ["الصف", "className"],
    ["الواجب", "assignment"],
    ["الحالة", "status"],
    ["الدرجة", "grade"],
    ["ملاحظة المُدرّس", "comment"]
  ];

  for (const row of rows) {
    const line = fields
      .map(([label, key]) => ({ label, value: String(row[key] ?? "") }))
      .filter((f) => f.value)
      .map((f) => `${f.label}: ${f.value}`)
      .join("  |  ");

    doc.setFont("Cairo", "normal");
    doc.setFontSize(13);
    const wrapped = doc.splitTextToSize(line, contentWidth).map((l: string) => shapeReorder(doc, l));

    if (y + wrapped.length * lineHeight > pageHeight - 40) {
      doc.addPage();
      y = 70;
      drawPageTitle();
    }

    doc.text(wrapped, pageWidth - margin, y, { align: "right", maxWidth: contentWidth, ...BIDI_PASSTHROUGH });
    y += wrapped.length * lineHeight + 4;
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------------------
// Student report PDF — «ملف واجبات الطالب»
// ---------------------------------------------------------------------------

function buildStudentPdf(rows: Row[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  disableArabicProcessing(doc as Parameters<typeof disableArabicProcessing>[0]);
  doc.addFileToVFS("Amiri-Regular.ttf", fontBase64("Amiri-Regular.ttf"));
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", fontBase64("Amiri-Bold.ttf"));
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
  doc.addFileToVFS("Majalla-Regular.ttf", fontBase64("Majalla-Regular.ttf"));
  doc.addFont("Majalla-Regular.ttf", "Majalla", "normal");
  doc.addFileToVFS("Majalla-Bold.ttf", fontBase64("Majalla-Bold.ttf"));
  doc.addFont("Majalla-Bold.ttf", "Majalla", "bold");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const MARGIN = 44;
  const right = pageWidth - MARGIN;
  const left = MARGIN;
  const tableWidth = right - left;
  const LOGO = 62;
  const FOOTER_Y = pageHeight - 42;
  const MAX_Y = pageHeight - 60;

  const first = rows[0];
  const studentName = first?.studentName ?? "";
  const studentCode = first?.studentCode ?? "";
  const className = first?.className ?? "";

  const rowH = 26;
  const colHw = Math.round(tableWidth * 0.46);
  const colGrade = Math.round(tableWidth * 0.24);
  const colMax = tableWidth - colHw - colGrade;
  const colHwX = right - colHw;
  const colGradeX = colHwX - colGrade;
  const colMaxX = left;

  const drawFrame = () => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.75);
    doc.rect(16, 16, pageWidth - 32, pageHeight - 32);
  };

  const drawFooter = () => {
    doc.setFont("Majalla", "normal");
    doc.setFontSize(13);
    doc.setTextColor(90, 90, 90);
    doc.text(shapeReorder(doc, `تاريخ التصدير: ${exportTimestamp()}`), pageWidth / 2, FOOTER_Y, { align: "center", ...BIDI_PASSTHROUGH });
    doc.setTextColor(0, 0, 0);
  };

  const drawTitleBlock = () => {
    doc.addImage(imageBase64("image.png"), "PNG", left, 40, LOGO, LOGO);
    doc.addImage(imageBase64("Logo.jpeg"), "JPEG", right - LOGO, 40, LOGO, LOGO);
    doc.setFont("Amiri", "bold");
    doc.setFontSize(24);
    doc.text(shapeReorder(doc, "ملف واجبات الطالب "), pageWidth / 2, 80, { align: "center", ...BIDI_PASSTHROUGH });
  };

  let tableTop = 132;
  const drawTableHeader = () => {
    doc.setFillColor(235, 239, 246);
    doc.setDrawColor(160, 160, 160);
    doc.rect(colHwX, tableTop, colHw, rowH, "FD");
    doc.rect(colGradeX, tableTop, colGrade, rowH, "FD");
    doc.rect(colMaxX, tableTop, colMax, rowH, "FD");
    doc.setFont("Majalla", "bold");
    doc.setFontSize(14);
    doc.text(shapeReorder(doc, "الواجب"), colHwX + colHw / 2, tableTop + 17, { align: "center", ...BIDI_PASSTHROUGH });
    doc.text(shapeReorder(doc, "الدرجة الكاملة للواجب"), colGradeX + colGrade / 2, tableTop + 17, { align: "center", ...BIDI_PASSTHROUGH });
    doc.text(shapeReorder(doc, "درجة الطالب"), colMaxX + colMax / 2, tableTop + 17, { align: "center", ...BIDI_PASSTHROUGH });
  };

  let y: number;
  const newPage = () => {
    doc.addPage();
    drawFrame();
    drawFooter();
    drawTitleBlock();
    tableTop = 132;
    drawTableHeader();
    y = tableTop + rowH;
  };

  // Page 1 scaffold
  drawFrame();
  drawFooter();
  drawTitleBlock();

  // Student info block
  y = 126;
  for (const [label, value] of [
    ["الاسم", studentName],
    ["الكود", studentCode],
    ["الصف", className]
  ] as Array<[string, string]>) {
    if (!value) continue;
    doc.setFont("Majalla", "bold");
    doc.setFontSize(18);
    doc.text(shapeReorder(doc, `${label}: ${value}`), right, y, { align: "right", ...BIDI_PASSTHROUGH });
    y += 28;
  }

  if (!rows.length) {
    doc.setFont("Majalla", "normal");
    doc.setFontSize(15);
    doc.setTextColor(120, 120, 120);
    doc.text(shapeReorder(doc, "لا توجد بيانات."), pageWidth / 2, y + 30, { align: "center", ...BIDI_PASSTHROUGH });
  } else {
    y += 6;
    tableTop = y;
    drawTableHeader();
    y = tableTop + rowH;

    doc.setFont("Majalla", "normal");
    doc.setFontSize(13.5);

    for (const row of rows) {
      const title = row.assignment ? row.assignment : "—";
      const wrapped = doc.splitTextToSize(title, colHw - 14);
      const lines = (Array.isArray(wrapped) ? wrapped : [wrapped]).map((l: string) => shapeReorder(doc, l));
      const cellH = Math.max(rowH, lines.length * 16 + 10);

      if (y + cellH > MAX_Y) newPage();

      doc.setDrawColor(170, 170, 170);
      doc.setLineWidth(0.4);
      doc.rect(colHwX, y, colHw, cellH);
      doc.rect(colGradeX, y, colGrade, cellH);
      doc.rect(colMaxX, y, colMax, cellH);

      doc.text(lines, right - 6, y + 18, { align: "right", ...BIDI_PASSTHROUGH });
      doc.setFont("Majalla", "normal");
      doc.setFontSize(13.5);
      doc.text(row.maxGrade ? row.maxGrade : "—", colGradeX + colGrade / 2, y + 19, { align: "center", ...BIDI_PASSTHROUGH });
      doc.text(row.grade ? row.grade : "—", colMaxX + colMax / 2, y + 19, { align: "center", ...BIDI_PASSTHROUGH });

      y += cellH;
    }

    // Totals row (1 row × 2 cells)
    const sumGrade = rows.reduce((acc, r) => {
      const v = Number.parseFloat(r.grade ?? "");
      return acc + (Number.isFinite(v) && v > 0 ? v : 0);
    }, 0);
    const sumMax = rows.reduce((acc, r) => {
      const v = Number.parseFloat(r.maxGrade ?? "");
      return acc + (Number.isFinite(v) && v > 0 ? v : 0);
    }, 0);
    const pct = sumMax > 0 ? (sumGrade / sumMax) * 100 : 0;
    const pctStr = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);

    y += 16;
    const tall = 36;
    if (y + tall > MAX_Y) newPage();

    const half = tableWidth / 2;
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(150, 150, 150);
    doc.rect(right - half, y, half, tall, "FD");
    doc.rect(left, y, half, tall, "FD");
    doc.setFont("Majalla", "bold");
    doc.setFontSize(15);
    doc.text(shapeReorder(doc, `مجموع درجات الطالب: ${sumGrade} من ${sumMax}`), right - half / 2, y + 23, { align: "center", ...BIDI_PASSTHROUGH });
    doc.text(shapeReorder(doc, `النسبة المئوية: ${pctStr}%`), left + half / 2, y + 23, { align: "center", ...BIDI_PASSTHROUGH });
  }

  return Buffer.from(doc.output("arraybuffer"));
}