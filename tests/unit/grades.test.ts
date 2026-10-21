import { describe, it, expect } from "vitest";
import {
  cellKey,
  formatGrade,
  gradeTone,
  studentTotals,
  type GradeSheetAssignment
} from "@/lib/grades";

const assignments: GradeSheetAssignment[] = [
  { id: "a1", title: "واجب أول", maxGrade: 20 },
  { id: "a2", title: "واجب ثاني", maxGrade: 10 }
];

describe("cellKey", () => {
  it("pairs an assignment with a student", () => {
    expect(cellKey("a1", "s1")).toBe("a1:s1");
  });

  it("never collides across assignments", () => {
    expect(cellKey("a1", "s2")).not.toBe(cellKey("a2", "s1"));
  });
});

describe("gradeTone", () => {
  it("treats a missing grade as untinted", () => {
    expect(gradeTone(null, 20)).toBe("none");
  });

  it("ignores a zero or negative full mark", () => {
    expect(gradeTone(5, 0)).toBe("none");
  });

  it("marks 90% and above as high", () => {
    expect(gradeTone(18, 20)).toBe("high");
    expect(gradeTone(20, 20)).toBe("high");
  });

  it("marks 70% up to 90% as mid", () => {
    expect(gradeTone(14, 20)).toBe("mid");
    expect(gradeTone(17.9, 20)).toBe("mid");
  });

  it("marks below 70% as low", () => {
    expect(gradeTone(13.9, 20)).toBe("low");
    expect(gradeTone(0, 20)).toBe("low");
  });

  it("matches the thresholds the Excel export uses", () => {
    expect(gradeTone(9, 10)).toBe("high");
    expect(gradeTone(7, 10)).toBe("mid");
    expect(gradeTone(6.9, 10)).toBe("low");
  });
});

describe("studentTotals", () => {
  it("sums the recorded grades and the full marks of every assignment", () => {
    const totals = studentTotals(
      "s1",
      assignments,
      {
        [cellKey("a1", "s1")]: "18",
        [cellKey("a2", "s1")]: "8"
      }
    );
    expect(totals.sum).toBe(26);
    expect(totals.max).toBe(30);
    expect(totals.graded).toBe(2);
    expect(totals.percent).toBeCloseTo(86.7, 1);
  });

  it("ignores an empty cell instead of counting it as zero", () => {
    const totals = studentTotals(
      "s1",
      assignments,
      {
        [cellKey("a1", "s1")]: "",
        [cellKey("a2", "s1")]: "10"
      }
    );
    expect(totals.sum).toBe(10);
    expect(totals.graded).toBe(1);
    expect(totals.percent).toBeCloseTo(33.3, 1);
  });

  it("reports zero percent for a student with no grades", () => {
    const totals = studentTotals("s1", assignments, {});
    expect(totals.sum).toBe(0);
    expect(totals.graded).toBe(0);
    expect(totals.percent).toBe(0);
  });

  it("does not divide by zero when there are no assignments", () => {
    const totals = studentTotals("s1", [], {});
    expect(totals.max).toBe(0);
    expect(totals.percent).toBe(0);
  });

  it("skips a value that is not a number", () => {
    const totals = studentTotals("s1", assignments, { [cellKey("a1", "s1")]: "abc" });
    expect(totals.sum).toBe(0);
    expect(totals.graded).toBe(0);
  });
});

describe("formatGrade", () => {
  it("keeps a whole mark whole", () => {
    expect(formatGrade(18)).toBe("18");
  });

  it("keeps a half mark", () => {
    expect(formatGrade(17.5)).toBe("17.5");
  });

  it("rounds to two decimals", () => {
    expect(formatGrade(86.666)).toBe("86.67");
  });
});
