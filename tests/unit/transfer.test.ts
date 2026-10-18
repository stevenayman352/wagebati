import { describe, it, expect } from "vitest";
import { read, utils, write } from "xlsx";
import {
  buildTransferTemplateBuffer,
  isCrossYearTransfer,
  parseTransferFile,
  validateTransferRows,
  type ParsedTransferRow,
  type TransferClass
} from "@/lib/transfer";

async function buildWorkbook(sheets: Record<string, unknown[][]>[]): Promise<Buffer> {
  const wb = utils.book_new();
  for (const sheet of sheets) {
    for (const [name, rows] of Object.entries(sheet)) {
      utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), name);
    }
  }
  return write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const headers = ["code", "old class", "new class"];

describe("isCrossYearTransfer", () => {
  it("is false when both labels are equal (A → B sections of the same year)", () => {
    expect(isCrossYearTransfer("سنة اولى بنين", "سنة اولى بنين")).toBe(false);
  });

  it("is false when labels differ only in whitespace/case", () => {
    expect(isCrossYearTransfer("  سنة اولى بنين ", "سنة اولى بنين")).toBe(false);
  });

  it("is true when both labels are set and different", () => {
    expect(isCrossYearTransfer("سنة اولى بنين", "سنة ثانية بنين")).toBe(true);
  });

  it("is false when either label is missing (never destroys data)", () => {
    expect(isCrossYearTransfer("", "سنة ثانية بنين")).toBe(false);
    expect(isCrossYearTransfer("سنة اولى بنين", "")).toBe(false);
    expect(isCrossYearTransfer(null, undefined)).toBe(false);
  });
});

describe("parseTransferFile", () => {
  it("parses English headers and maps row numbers starting at 2", async () => {
    const buf = await buildWorkbook([
      { sheet1: [headers, ["ABCD12", "سنة اولى بنين A", "سنة اولى بنين B"]] }
    ]);
    const result = await parseTransferFile(buf);
    expect(result.fileError).toBeUndefined();
    expect(result.headerError).toBeUndefined();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      row: 2,
      code: "abcd12",
      fromClass: "سنة اولى بنين A",
      toClass: "سنة اولى بنين B"
    });
  });

  it("detects Arabic headers in any order", async () => {
    const buf = await buildWorkbook([
      { sheet1: [["الصف الجديد", "الكود", "الصف القديم"], ["سنة ثانية بنين", "MM123", "سنة اولى بنين"]] }
    ]);
    const result = await parseTransferFile(buf);
    expect(result.rows[0]).toMatchObject({
      code: "mm123",
      fromClass: "سنة اولى بنين",
      toClass: "سنة ثانية بنين"
    });
  });

  it("reports the missing required column by header error", async () => {
    const buf = await buildWorkbook([{ sheet1: [["code", "old class"], ["AA22", "الصف أ"]] }]);
    const result = await parseTransferFile(buf);
    expect(result.headerError).toContain("new class");
    expect(result.rows).toHaveLength(0);
  });

  it("treats unreadable content as an empty workbook without crashing", async () => {
    const result = await parseTransferFile(new Uint8Array([9, 9, 9]));
    expect(result.rows).toHaveLength(0);
  });

  it("ignores fully empty data rows", async () => {
    const buf = await buildWorkbook([
      { sheet1: [headers, [], [], ["BB11", "أ", "ب"]] }
    ]);
    const result = await parseTransferFile(buf);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].row).toBe(4);
  });
});

describe("validateTransferRows", () => {
  const classes: TransferClass[] = [
    { id: "c1", name: "سنة اولى بنين A", gradeLabel: "سنة اولى بنين" },
    { id: "c2", name: "سنة اولى بنين B", gradeLabel: "سنة اولى بنين" },
    { id: "c3", name: "سنة ثانية بنين أ", gradeLabel: "سنة ثانية بنين" },
    { id: "c4", name: "صف بدون سنة", gradeLabel: "" }
  ];
  const students = [
    { id: "s1", code: "mm123", name: "محمد" },
    { id: "s2", code: "nn456", name: "نور" }
  ];
  const links = [
    { studentId: "s1", classId: "c1" },
    { studentId: "s2", classId: "c4" }
  ];
  const options = { students, classes, links };

  const base: ParsedTransferRow = {
    row: 2,
    code: "mm123",
    fromClass: "سنة اولى بنين A",
    toClass: "سنة اولى بنين B"
  };

  it("accepts a valid same-year transfer and marks it as not cross-year", () => {
    const { valid, issues } = validateTransferRows([base], options);
    expect(issues).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      studentId: "s1",
      fromClassId: "c1",
      toClassId: "c2",
      crossYear: false
    });
  });

  it("marks a cross-year transfer correctly", () => {
    const { valid } = validateTransferRows([{ ...base, toClass: "سنة ثانية بنين أ" }], options);
    expect(valid[0].crossYear).toBe(true);
  });

  it("treats a target class without a year label as same-year", () => {
    const { valid } = validateTransferRows([{ ...base, toClass: "صف بدون سنة" }], options);
    expect(valid[0].crossYear).toBe(false);
  });

  it("rejects an unknown student code", () => {
    const { valid, issues } = validateTransferRows([{ ...base, code: "zz999" }], options);
    expect(valid).toHaveLength(0);
    expect(issues[0]).toMatchObject({ row: 2, column: "code" });
  });

  it("rejects a code that belongs to a non-student account (filtered out upstream)", () => {
    // The action only passes role="student" accounts, so a teacher's code is
    // simply not found in the students list.
    const { valid, issues } = validateTransferRows([{ ...base, code: "tt789" }], options);
    expect(valid).toHaveLength(0);
    expect(issues[0]).toMatchObject({ row: 2, column: "code", message: expect.stringContaining("لا يوجد طالب") });
  });

  it("rejects unknown old and new class names", () => {
    const { valid, issues } = validateTransferRows(
      [{ ...base, fromClass: "غير موجود", toClass: "أيضاً غير موجود" }],
      options
    );
    expect(valid).toHaveLength(0);
    const columns = issues.map((i) => i.column);
    expect(columns).toContain("from");
    expect(columns).toContain("to");
  });

  it("rejects a transfer where old and new are the same class", () => {
    const { valid, issues } = validateTransferRows([{ ...base, toClass: "سنة اولى بنين A" }], options);
    expect(valid).toHaveLength(0);
    expect(issues[0]).toMatchObject({ row: 2, column: "to" });
  });

  it("rejects a student who is not currently in the old class", () => {
    const { valid, issues } = validateTransferRows([{ ...base, fromClass: "سنة ثانية بنين أ" }], options);
    expect(valid).toHaveLength(0);
    expect(issues[0]).toMatchObject({ row: 2, column: "from" });
  });

  it("rejects duplicate codes inside the file", () => {
    const { valid, issues } = validateTransferRows([base, { ...base, row: 3, toClass: "سنة ثانية بنين أ" }], options);
    expect(valid).toHaveLength(1);
    expect(issues).toContainEqual({ row: 3, column: "code", message: expect.any(String) });
  });

  it("rejects empty old/new class cells", () => {
    const { valid, issues } = validateTransferRows([{ ...base, fromClass: "", toClass: "" }], options);
    expect(valid).toHaveLength(0);
    const columns = issues.map((i) => i.column);
    expect(columns).toContain("from");
    expect(columns).toContain("to");
  });
});

describe("buildTransferTemplateBuffer", () => {
  it("builds a two-sheet workbook with transfer headers and copyable classes", async () => {
    const buf = await buildTransferTemplateBuffer([
      { id: "", name: "سنة اولى بنين A", gradeLabel: "سنة اولى بنين" },
      { id: "", name: "سنة ثانية بنين أ", gradeLabel: "سنة ثانية بنين" }
    ]);
    const wb = read(buf, { type: "array" });
    expect(wb.SheetNames).toEqual(["النقل", "الصفوف"]);

    const sheet = wb.Sheets["النقل"];
    expect(sheet["A1"].v).toBe("code");
    expect(sheet["C1"].v).toBe("new class");

    const classes = wb.Sheets["الصفوف"];
    expect(classes["A3"].v).toBe("سنة اولى بنين A");
    expect(classes["B3"].v).toBe("سنة اولى بنين");
  });
});
