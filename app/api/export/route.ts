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

const FONT_FILE = "Cairo-Regular.ttf";
let cairoBase64: string | null = null;

type DB = ReturnType<typeof createSupabaseAdminClient>;

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

  const fileBase = target === "class" ? `تقرير-صف-${className || id.slice(0, 8)}` : `تقرير-طالب-${className || id.slice(0, 8)}`;

  if (format === "xlsx") {
    const buffer = await buildXlsxBuffer(rows.data, className);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${encodeURIComponent(fileBase)}.xlsx"`
      }
    });
  }

  const pdf = buildPdf(rows.data, fileBase);
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
      "id, status, needs_revision, updated_at, " +
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
      "id, status, needs_revision, updated_at, " +
        "grade_row:grades!grades_conversation_id_fkey(grade, comment), " +
        "submissions:submissions!submissions_conversation_id_fkey(attempt_number, submitted_at), " +
        "assignment:assignments(title, max_grade)"
    )
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: (data ?? []).map((row) => toRow(row as unknown as ExportItem, className)) };
}

function buildPdf(rows: Row[], fileBase: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 16;

  let y: number;
  const drawPageTitle = () => {
    doc.setFont("Cairo", "normal");
    doc.setFontSize(16);
    doc.text(`${fileBase} — صفحة ${doc.getNumberOfPages()}`, pageWidth - margin, 40, { align: "right" });
  };

  doc.addFileToVFS(FONT_FILE, cairoFontBase64());
  doc.addFont(FONT_FILE, "Cairo", "normal");
  drawPageTitle();
  y = 70;

  if (!rows.length) {
    doc.setFont("Cairo", "normal");
    doc.setFontSize(10);
    doc.text("لا توجد بيانات.", pageWidth - margin, y, { align: "right" });
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
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(line, contentWidth);

    if (y + wrapped.length * lineHeight > pageHeight - 40) {
      doc.addPage();
      y = 70;
      drawPageTitle();
    }

    doc.text(line, pageWidth - margin, y, { align: "right", maxWidth: contentWidth });
    y += wrapped.length * lineHeight + 4;
  }

  return Buffer.from(doc.output("arraybuffer"));
}

function cairoFontBase64() {
  if (!cairoBase64) {
    cairoBase64 = readFileSync(path.join(process.cwd(), "public", "fonts", FONT_FILE)).toString("base64");
  }
  return cairoBase64;
}
