import { describe, it, expect } from "vitest";
import { read, utils, write } from "xlsx";
import {
  buildAccountTemplateBuffer,
  parseImportFile,
  validateImportRows,
  type ParsedImportRow
} from "@/lib/import-accounts";

async function buildWorkbook(sheets: Record<string, unknown[][]>[]): Promise<Buffer> {
  const wb = utils.book_new();
  for (const sheet of sheets) {
    for (const [name, rows] of Object.entries(sheet)) {
      utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), name);
    }
  }
  return write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const headers = ["code", "name", "role", "class", "startup password"];

describe("parseImportFile", () => {
  it("parses English headers and maps row numbers starting at 2", async () => {
    const buf = await buildWorkbook([
      {
        sheet1: [headers, ["ABCD12", "طالب أول", "student", "الصف الأول", "secretpass"]]
      }
    ]);
    const result = await parseImportFile(buf);
    expect(result.fileError).toBeUndefined();
    expect(result.headerError).toBeUndefined();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      row: 2,
      code: "abcd12",
      name: "طالب أول",
      role: "student",
      className: "الصف الأول",
      password: "secretpass"
    });
  });

  it("detects Arabic headers in any order", async () => {
    const buf = await buildWorkbook([
      {
        sheet1: [["كلمة المرور", "الصف", "الكود", "الاسم", "الدور"], ["pass1234", "ثانوي", "T2", "معلمة", "teacher"]]
      }
    ]);
    const result = await parseImportFile(buf);
    expect(result.rows[0]).toMatchObject({ code: "t2", name: "معلمة", role: "teacher", className: "ثانوي", password: "pass1234" });
  });

  it("reads only the first sheet of a two-sheet workbook", async () => {
    const buf = await buildWorkbook([
      {
        "الحسابات": [headers, ["AAA1", "طالب", "student", "", "password1"]]
      },
      {
        "الصفوف": [["الصفوف المتاحة"], ["الصف أ"], ["الصف ب"]]
      }
    ]);
    const result = await parseImportFile(buf);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].code).toBe("aaa1");
  });

  it("reports the missing required column by header error", async () => {
    const buf = await buildWorkbook([{ sheet1: [["code", "name", "role", "class"], ["AA22", "غ", "student", ""]] }]);
    const result = await parseImportFile(buf);
    expect(result.headerError).toContain("startup password");
    expect(result.rows).toHaveLength(0);
  });

  it("treats unreadable content as an empty workbook without crashing", async () => {
    const result = await parseImportFile(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.rows).toHaveLength(0);
  });

  it("ignores fully empty data rows", async () => {
    const buf = await buildWorkbook([{ sheet1: [headers, [], [], ["BB11", "طالب", "student", "", "password1"]] }]);
    const result = await parseImportFile(buf);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].row).toBe(4);
  });
});

describe("validateImportRows", () => {
  const base: ParsedImportRow = {
    row: 2,
    code: "mm123",
    name: "محمد",
    role: "student",
    className: "الصف الأول",
    password: "secretpass"
  };
  const options = {
    existingCodes: ["used00"],
    classNames: ["الصف الأول", "الصف الثاني"]
  };

  it("accepts a fully valid row and resolves the class", () => {
    const { valid, issues } = validateImportRows([base], options);
    expect(issues).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0].role).toBe("student");
    expect(valid[0].className).toBe("الصف الأول");
  });

  it("accepts a row with an empty class cell as unlinked", () => {
    const { valid, issues } = validateImportRows([{ ...base, className: "" }], options);
    expect(issues).toHaveLength(0);
    expect(valid[0].className).toBeNull();
  });

  it("rejects a row whose class does not exist with row + column", () => {
    const { valid, issues } = validateImportRows([{ ...base, className: "غير موجود" }], options);
    expect(valid).toHaveLength(0);
    expect(issues).toContainEqual({ row: 2, column: "class", message: expect.stringContaining("غير موجود") });
  });

  it("rejects invalid role, short password and short name", () => {
    const row: ParsedImportRow = { ...base, role: "principal", password: "short", name: "غ" };
    const { valid, issues } = validateImportRows([row], options);
    expect(valid).toHaveLength(0);
    const columns = issues.map((i) => i.column);
    expect(columns).toContain("role");
    expect(columns).toContain("password");
    expect(columns).toContain("name");
  });

  it("rejects duplicate codes inside the file", () => {
    const { valid, issues } = validateImportRows([base, { ...base, row: 3 }], options);
    expect(valid).toHaveLength(1);
    expect(issues).toContainEqual({ row: 3, column: "code", message: expect.any(String) });
  });

  it("rejects codes that already exist in the system", () => {
    const { valid, issues } = validateImportRows([{ ...base, code: "used00" }], options);
    expect(valid).toHaveLength(0);
    expect(issues[0].column).toBe("code");
  });

  it("accepts teacher and admin roles", () => {
    const teacher = validateImportRows([{ ...base, role: "teacher" }], options);
    const admin = validateImportRows([{ ...base, role: "admin" }], options);
    expect(teacher.valid[0].role).toBe("teacher");
    expect(admin.valid[0].role).toBe("admin");
  });
});

describe("buildAccountTemplateBuffer", () => {
  it("builds a two-sheet workbook with account headers and copyable classes", async () => {
    const buf = await buildAccountTemplateBuffer(["الصف أ", "الصف ب"]);
    const wb = read(buf, { type: "array" });
    expect(wb.SheetNames).toEqual(["الحسابات", "الصفوف"]);

    const accounts = wb.Sheets["الحسابات"];
    expect(accounts["A1"].v).toBe("code");
    expect(accounts["E1"].v).toBe("startup password");

    const classes = wb.Sheets["الصفوف"];
    expect(classes["A2"].v).toBe("الصف أ");
    expect(classes["A3"].v).toBe("الصف ب");
  });
});