import { describe, it, expect } from "vitest";
import {
  computeAssignmentStatus,
  conversationHasActivity,
  type AssignmentStatusInput
} from "@/lib/assignment-status";

const NOW = new Date("2026-01-15T00:00:00Z").getTime();
const FUTURE = "2026-01-31T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";

function teacher(input: Partial<AssignmentStatusInput>): AssignmentStatusInput {
  return { role: "teacher", status: "active", nowMs: NOW, ...input };
}

function student(input: Partial<AssignmentStatusInput>): AssignmentStatusInput {
  return { role: "student", status: "active", nowMs: NOW, ...input };
}

describe("conversationHasActivity", () => {
  it("is true when any evidence exists", () => {
    expect(conversationHasActivity({ hasStudentMessage: true })).toBe(true);
    expect(conversationHasActivity({ hasSubmission: true, hasGrade: false })).toBe(true);
    expect(conversationHasActivity({ hasGrade: true })).toBe(true);
    expect(conversationHasActivity({ hasSubmission: false, hasStudentMessage: false })).toBe(false);
  });
});

describe("computeAssignmentStatus (teacher)", () => {
  it("before due, no activity -> not_submitted", () => {
    expect(computeAssignmentStatus(teacher({ dueAt: FUTURE }))).toBe("not_submitted");
  });

  it("before due, activity -> under_review", () => {
    expect(
      computeAssignmentStatus(teacher({ dueAt: FUTURE, hasStudentMessage: true }))
    ).toBe("under_review");
  });

  it("graded before due -> graded (grade wins over activity branch)", () => {
    expect(
      computeAssignmentStatus(teacher({ dueAt: FUTURE, hasGrade: true, hasSubmission: true }))
    ).toBe("graded");
  });

  it("after due, no activity -> overdue_not_submitted", () => {
    expect(computeAssignmentStatus(teacher({ dueAt: PAST }))).toBe("overdue_not_submitted");
  });

  it("after due, activity -> awaiting_grading", () => {
    expect(
      computeAssignmentStatus(teacher({ dueAt: PAST, hasSubmission: true }))
    ).toBe("awaiting_grading");
  });

  it("closed with grade -> completed", () => {
    expect(
      computeAssignmentStatus(teacher({ status: "closed", closedBy: "teacher-1", hasGrade: true }))
    ).toBe("completed");
  });

  it("auto-closed (closed_by null) with activity -> awaiting_grading", () => {
    expect(
      computeAssignmentStatus(
        teacher({
          dueAt: PAST,
          status: "closed",
          closedBy: null,
          hasSubmission: true
        })
      )
    ).toBe("awaiting_grading");
  });

  it("auto-closed (closed_by null) without activity -> overdue_not_submitted", () => {
    expect(
      computeAssignmentStatus(teacher({ status: "closed", closedBy: null, dueAt: PAST }))
    ).toBe("overdue_not_submitted");
  });
});

describe("computeAssignmentStatus (student)", () => {
  it("before due, no activity -> not_submitted", () => {
    expect(computeAssignmentStatus(student({ dueAt: FUTURE }))).toBe("not_submitted");
  });

  it("before due, activity -> under_review", () => {
    expect(
      computeAssignmentStatus(student({ dueAt: FUTURE, hasStudentMessage: true }))
    ).toBe("under_review");
  });

  it("after due, activity -> submitted", () => {
    expect(
      computeAssignmentStatus(student({ dueAt: PAST, hasSubmission: true }))
    ).toBe("submitted");
  });

  it("after due, no activity -> missed", () => {
    expect(computeAssignmentStatus(student({ dueAt: PAST }))).toBe("missed");
  });

  it("closed by teacher -> completed", () => {
    expect(
      computeAssignmentStatus(student({ status: "closed", closedBy: "teacher-1", hasSubmission: true }))
    ).toBe("completed");
  });

  it("auto-closed (closed_by null) with activity -> submitted", () => {
    expect(
      computeAssignmentStatus(
        student({ status: "closed", closedBy: null, hasStudentMessage: true, dueAt: PAST })
      )
    ).toBe("submitted");
  });

  it("auto-closed (closed_by null) without activity -> missed", () => {
    expect(
      computeAssignmentStatus(student({ status: "closed", closedBy: null, dueAt: PAST }))
    ).toBe("missed");
  });
});