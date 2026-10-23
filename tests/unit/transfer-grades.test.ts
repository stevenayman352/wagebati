import { describe, expect, it } from "vitest";
import {
  buildTransferGradePreview,
  mergeTransferGradePreviews,
  normalizeAssignmentTitle,
  parseGradePlan,
  resolveGradeValue,
  validateGradePlan,
  type GradePreviewInput,
  type TransferGradePlan
} from "@/lib/transfer-grades";

const target = { id: "target", name: "صف ب", gradeLabel: "سنة أولى" };
const source = { id: "source", name: "صف أ", gradeLabel: "سنة أولى" };
const students = [{ id: "s1", name: "طالب واحد" }];
const links = [{ studentId: "s1", classId: "source" }];

function input(overrides: Partial<GradePreviewInput> = {}): GradePreviewInput {
  return {
    target,
    sourceClasses: [source],
    students,
    links,
    sourceAssignments: [
      { id: "a1", classId: "source", title: "حفظ سورة", maxGrade: 20 }
    ],
    targetAssignments: [{ id: "t1", title: "حفظ سورة", maxGrade: 20 }],
    sourceGrades: [{ assignmentId: "a1", studentId: "s1", grade: 18 }],
    targetGrades: [],
    ...overrides
  };
}

describe("normalizeAssignmentTitle", () => {
  it("ignores Arabic letter variants, diacritics and digits", () => {
    expect(normalizeAssignmentTitle("حِفْظُ سُورَة ١")).toBe(
      normalizeAssignmentTitle("حفظ سوره 1")
    );
    expect(normalizeAssignmentTitle("  سورة   البقرة ")).toBe(
      normalizeAssignmentTitle("سوره البقره")
    );
  });

  it("normalizes punctuation and spacing", () => {
    expect(normalizeAssignmentTitle("الواجب - الأول")).toBe("الواجب الاول");
  });
});

describe("resolveGradeValue", () => {
  it("keeps the same number in raw mode and clamps to the target maximum", () => {
    expect(resolveGradeValue(15, 20, 20, "raw")).toBe(15);
    expect(resolveGradeValue(18, 20, 10, "raw")).toBe(10);
  });

  it("keeps the percentage in proportional mode", () => {
    expect(resolveGradeValue(18, 20, 10, "proportional")).toBe(9);
    expect(resolveGradeValue(15, 30, 10, "proportional")).toBe(5);
    expect(resolveGradeValue(17, 20, 30, "proportional")).toBe(25.5);
  });

  it("never returns a negative or above-maximum mark", () => {
    expect(resolveGradeValue(-2, 20, 20, "raw")).toBe(0);
    expect(resolveGradeValue(99, 20, 10, "proportional")).toBe(10);
  });
});

describe("buildTransferGradePreview", () => {
  it("auto-matches a unique title and needs no review", () => {
    const preview = buildTransferGradePreview(input());
    expect(preview.needsReview).toBe(false);
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0].sourceAssignments[0].suggestedTargetId).toBe("t1");
    expect(preview.autoPlan).toEqual([
      {
        sourceClassId: "source",
        targetClassId: "target",
        rows: [
          {
            sourceAssignmentId: "a1",
            targetAssignmentId: "t1",
            scale: "raw",
            onConflict: "keep"
          }
        ]
      }
    ]);
  });

  it("asks for review when the full mark differs and suggests proportional", () => {
    const preview = buildTransferGradePreview(
      input({ targetAssignments: [{ id: "t1", title: "حفظ سورة", maxGrade: 10 }] })
    );
    expect(preview.needsReview).toBe(true);
    expect(preview.autoPlan[0].rows[0].scale).toBe("proportional");
  });

  it("asks for review when the new homework already has a mark", () => {
    const preview = buildTransferGradePreview(
      input({ targetGrades: [{ assignmentId: "t1", studentId: "s1", grade: 12 }] })
    );
    expect(preview.needsReview).toBe(true);
    expect(preview.groups[0].targetGrades.t1.s1).toBe(12);
    expect(preview.autoPlan[0].rows[0].onConflict).toBe("keep");
  });

  it("leaves an ambiguous title unmapped", () => {
    const preview = buildTransferGradePreview(
      input({
        targetAssignments: [
          { id: "t1", title: "حفظ سورة", maxGrade: 20 },
          { id: "t2", title: "حفظ سوره", maxGrade: 20 }
        ]
      })
    );
    expect(preview.needsReview).toBe(true);
    expect(preview.groups[0].sourceAssignments[0].suggestedTargetId).toBeNull();
    expect(preview.groups[0].sourceAssignments[0].candidateTargetIds).toEqual(["t1", "t2"]);
    expect(preview.autoPlan).toEqual([]);
  });

  it("asks for review when two old homework titles match the same new one", () => {
    const preview = buildTransferGradePreview(
      input({
        sourceAssignments: [
          { id: "a1", classId: "source", title: "حفظ سورة", maxGrade: 20 },
          { id: "a2", classId: "source", title: "حفظ سوره", maxGrade: 20 }
        ],
        sourceGrades: [
          { assignmentId: "a1", studentId: "s1", grade: 18 },
          { assignmentId: "a2", studentId: "s1", grade: 19 }
        ]
      })
    );
    expect(preview.needsReview).toBe(true);
    expect(preview.autoPlan[0].rows).toHaveLength(2);
  });

  it("ignores homework without marks", () => {
    const preview = buildTransferGradePreview(
      input({
        sourceAssignments: [
          { id: "a1", classId: "source", title: "حفظ سورة", maxGrade: 20 },
          { id: "a2", classId: "source", title: "بدون درجات", maxGrade: 20 }
        ]
      })
    );
    expect(preview.groups[0].sourceAssignments.map((a) => a.id)).toEqual(["a1"]);
    expect(preview.autoPlan[0].rows).toHaveLength(1);
  });

  it("does not request a mapping for a cross-year source", () => {
    const preview = buildTransferGradePreview(
      input({ sourceClasses: [{ ...source, gradeLabel: "سنة ثانية" }] })
    );
    expect(preview.groups[0].crossYear).toBe(true);
    expect(preview.needsReview).toBe(false);
    expect(preview.autoPlan).toEqual([]);
  });

  it("treats a missing label as same-year", () => {
    const preview = buildTransferGradePreview(
      input({ sourceClasses: [{ ...source, gradeLabel: "" }] })
    );
    expect(preview.groups[0].crossYear).toBe(false);
    expect(preview.autoPlan).toHaveLength(1);
  });
});

describe("validateGradePlan", () => {
  it("accepts the auto plan", () => {
    const preview = buildTransferGradePreview(input());
    expect(validateGradePlan(preview.autoPlan, preview)).toEqual({ ok: true });
  });

  it("rejects a missing source class group", () => {
    const preview = buildTransferGradePreview(input());
    const result = validateGradePlan([], preview);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("صف أ");
  });

  it("rejects a missing homework mapping", () => {
    const preview = buildTransferGradePreview(input());
    const plan: TransferGradePlan = [
      { sourceClassId: "source", targetClassId: "target", rows: [] }
    ];
    const result = validateGradePlan(plan, preview);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("حفظ سورة");
  });

  it("allows mapping two old homework to the same new homework (deduped on write)", () => {
    const preview = buildTransferGradePreview(
      input({
        sourceAssignments: [
          { id: "a1", classId: "source", title: "حفظ", maxGrade: 20 },
          { id: "a2", classId: "source", title: "مراجعة", maxGrade: 20 }
        ],
        sourceGrades: [
          { assignmentId: "a1", studentId: "s1", grade: 18 },
          { assignmentId: "a2", studentId: "s1", grade: 19 }
        ]
      })
    );
    const plan: TransferGradePlan = [
      {
        sourceClassId: "source",
        targetClassId: "target",
        rows: [
          {
            sourceAssignmentId: "a1",
            targetAssignmentId: "t1",
            scale: "raw",
            onConflict: "keep"
          },
          {
            sourceAssignmentId: "a2",
            targetAssignmentId: "t1",
            scale: "raw",
            onConflict: "keep"
          }
        ]
      }
    ];
    expect(validateGradePlan(plan, preview)).toEqual({ ok: true });
  });

  it("ignores cross-year groups", () => {
    const preview = buildTransferGradePreview(
      input({ sourceClasses: [{ ...source, gradeLabel: "سنة ثانية" }] })
    );
    expect(validateGradePlan(null, preview)).toEqual({ ok: true });
  });

  it("allows a null plan when there are no marks", () => {
    const preview = buildTransferGradePreview(input({ sourceGrades: [] }));
    expect(validateGradePlan(null, preview)).toEqual({ ok: true });
  });
});

describe("parseGradePlan", () => {
  const plan: TransferGradePlan = [
    {
      sourceClassId: "source",
      targetClassId: "target",
      rows: [
        {
          sourceAssignmentId: "a1",
          targetAssignmentId: "t1",
          scale: "proportional",
          onConflict: "overwrite"
        }
      ]
    }
  ];

  it("round-trips a valid plan", () => {
    expect(parseGradePlan(JSON.stringify(plan))).toEqual(plan);
  });

  it("returns null for missing or malformed input", () => {
    expect(parseGradePlan(null)).toBeNull();
    expect(parseGradePlan("")).toBeNull();
    expect(parseGradePlan("not json")).toBeNull();
    expect(parseGradePlan(JSON.stringify({}))).toBeNull();
    expect(
      parseGradePlan(
        JSON.stringify([
          { sourceClassId: "a", targetClassId: "b", rows: [{ scale: "raw" }] }
        ])
      )
    ).toBeNull();
  });
});

describe("mergeTransferGradePreviews", () => {
  it("combines groups, students and plans", () => {
    const first = buildTransferGradePreview(input());
    const second = buildTransferGradePreview({
      ...input(),
      target: { id: "target2", name: "صف ج", gradeLabel: "سنة أولى" },
      sourceClasses: [{ ...source, id: "source2", name: "صف د" }],
      links: [{ studentId: "s1", classId: "source2" }],
      sourceAssignments: [
        { id: "a2", classId: "source2", title: "حفظ سورة", maxGrade: 20 }
      ],
      sourceGrades: [{ assignmentId: "a2", studentId: "s1", grade: 18 }]
    });
    const merged = mergeTransferGradePreviews([first, second]);
    expect(merged.groups).toHaveLength(2);
    expect(merged.students).toHaveLength(1);
    expect(merged.autoPlan).toHaveLength(2);
    expect(merged.needsReview).toBe(false);
  });
});
