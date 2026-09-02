import { describe, it, expect } from "vitest";
import { statusLabel, toRow, buildXlsxBuffer } from "@/lib/export";

describe("statusLabel", () => {
  it("maps closed to مكتمل", () => {
    expect(statusLabel("closed", false, true)).toBe("مكتمل");
  });

  it("maps needs_revision to تحتاج مراجعة regardless of submissions", () => {
    expect(statusLabel("active", true, true)).toBe("تحتاج مراجعة");
    expect(statusLabel("active", true, false)).toBe("تحتاج مراجعة");
  });

  it("maps no-submission to بانتظار الطالب", () => {
    expect(statusLabel("active", false, false)).toBe("بانتظار الطالب");
  });

  it("maps active with submission to قيد المراجعة", () => {
    expect(statusLabel("active", false, true)).toBe("قيد المراجعة");
  });

  it("falls back to raw status for unknown values", () => {
    expect(statusLabel("weird", false, true)).toBe("weird");
  });
});

describe("toRow", () => {
  const base = {
    status: "active",
    needs_revision: false
  };

  it("builds a full row with grade and comment", () => {
    const row = toRow(
      {
        ...base,
        student: { full_name: "طالب", code: 4821 },
        assignment: { title: "حفظ" },
        grade_row: { grade: 19, comment: "ممتاز" },
        submissions: [{ attempt_number: 1, submitted_at: "2026-08-31T10:00:00Z" }],
        updated_at: "2026-08-30T10:00:00Z"
      },
      "الصف السادس"
    );
    expect(row.studentName).toBe("طالب");
    expect(row.studentCode).toBe("4821");
    expect(row.className).toBe("الصف السادس");
    expect(row.assignment).toBe("حفظ");
    expect(row.status).toBe("قيد المراجعة");
    expect(row.grade).toBe("19");
    expect(row.comment).toBe("ممتاز");
    expect(row.dates).toContain("2026-08-31");
  });

  it("handles grade_row being an array (PostgREST embed)", () => {
    const row = toRow(
      {
        ...base,
        grade_row: [{ grade: 18, comment: "جيد" }]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      "الصف السادس"
    );
    expect(row.grade).toBe("18");
    expect(row.comment).toBe("جيد");
  });

  it("returns empty strings for missing data and no submission", () => {
    const row = toRow(base, "الصف السادس");
    expect(row.studentName).toBe("");
    expect(row.grade).toBe("");
    expect(row.comment).toBe("");
    expect(row.dates).toBe("");
  });
});

describe("buildXlsxBuffer", () => {
  it("produces a real styled .xlsx ZIP buffer from rows", async () => {
    const buf = await buildXlsxBuffer([
      {
        studentName: "أحمد",
        studentCode: "1111",
        className: "الصف السادس",
        assignment: "واجب ١",
        status: "مكتمل",
        grade: "18",
        comment: "",
        dates: ""
      }
    ]);
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("builds the matrix: one row per student, homeworks as columns", async () => {
    const rows = [
      { studentName: "أحمد", studentCode: "1111", className: "الصف السادس", assignment: "واجب ١", status: "مكتمل", grade: "18", comment: "", dates: "" },
      { studentName: "أحمد", studentCode: "1111", className: "الصف السادس", assignment: "واجب ٢", status: "مكتمل", grade: "20", comment: "", dates: "" },
      { studentName: "محمد", studentCode: "2222", className: "الصف السادس", assignment: "واجب ١", status: "مكتمل", grade: "15", comment: "", dates: "" },
      { studentName: "محمد", studentCode: "2222", className: "الصف السادس", assignment: "واجب ٢", status: "مكتمل", grade: "12", comment: "", dates: "" }
    ];
    const buf = await buildXlsxBuffer(rows, "الصف السادس");
    const { read } = await import("xlsx");
    const wb = read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    expect(sheet["A1"].v).toContain("الصف السادس");
    expect(sheet["A1"].v).toContain("كشف درجات الواجبات");

    // header row 2: name | code | homework 1 | homework 2 | total
    expect(sheet["A2"].v).toBe("الاسم");
    expect(sheet["B2"].v).toBe("الكود");
    expect(String(sheet["C2"].v)).toContain("واجب ١");
    expect(String(sheet["C2"].v)).toContain("(من 20)");
    expect(String(sheet["D2"].v)).toContain("واجب ٢");
    expect(String(sheet["D2"].v)).toContain("(من 20)");
    expect(String(sheet["E2"].v)).toContain("مجموع درجات الواجبات");
    expect(String(sheet["E2"].v)).toContain("(من 40)");

    // student row 1
    expect(sheet["A3"].v).toBe("أحمد");
    expect(sheet["B3"].v).toBe("1111");
    expect(String(sheet["C3"].v)).toBe("18");
    expect(String(sheet["D3"].v)).toBe("20");
    expect(String(sheet["E3"].v)).toBe("38");

    // student row 2
    expect(sheet["A4"].v).toBe("محمد");
    expect(sheet["B4"].v).toBe("2222");
    expect(String(sheet["C4"].v)).toBe("15");
    expect(String(sheet["D4"].v)).toBe("12");
    expect(String(sheet["E4"].v)).toBe("27");
  });

  it("shows each homework max grade in the header and their sum in the total column", async () => {
    const rows = [
      { studentName: "أحمد", studentCode: "1111", className: "الصف السادس", assignment: "واجب أ", maxGrade: "25", status: "مكتمل", grade: "20", comment: "", dates: "" },
      { studentName: "أحمد", studentCode: "1111", className: "الصف السادس", assignment: "واجب ب", maxGrade: "30", status: "مكتمل", grade: "30", comment: "", dates: "" }
    ];
    const buf = await buildXlsxBuffer(rows, "الصف السادس");
    const { read } = await import("xlsx");
    const wb = read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    expect(String(sheet["C2"].v)).toContain("(من 25)");
    expect(String(sheet["D2"].v)).toContain("(من 30)");
    expect(String(sheet["E2"].v)).toContain("مجموع درجات الواجبات");
    expect(String(sheet["E2"].v)).toContain("(من 55)");
  });

  it("handles empty input with a readable banner", async () => {
    const buf = await buildXlsxBuffer([]);
    const { read } = await import("xlsx");
    const wb = read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    expect(sheet["A1"].v).toContain("كشف درجات الواجبات");
    expect(sheet["A3"].v).toContain("لا توجد بيانات.");
  });
});
