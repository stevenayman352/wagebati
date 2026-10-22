import { describe, it, expect } from "vitest";
import {
  isAssignmentVisibleToStudent,
  type StudentAssignmentVisibilityInput
} from "@/lib/student-visibility";

const NOW = Date.parse("2026-02-10T12:00:00Z");
const JOINED = "2026-02-01T00:00:00Z";
const PUBLISHED_BEFORE_JOIN = "2026-01-10T00:00:00Z";
const PUBLISHED_AFTER_JOIN = "2026-02-05T00:00:00Z";
const PAST = "2026-01-20T00:00:00Z";
const FUTURE = "2026-02-20T00:00:00Z";

function input(overrides: Partial<StudentAssignmentVisibilityInput> = {}): StudentAssignmentVisibilityInput {
  return {
    assignmentStatus: "published",
    dueAt: PAST,
    publishedAt: PUBLISHED_BEFORE_JOIN,
    createdAt: PUBLISHED_BEFORE_JOIN,
    joinedAt: JOINED,
    hasActivity: false,
    nowMs: NOW,
    ...overrides
  };
}

describe("isAssignmentVisibleToStudent", () => {
  it("shows homework published while the student was in the class, even long after the deadline", () => {
    expect(isAssignmentVisibleToStudent(input({ publishedAt: JOINED, createdAt: JOINED }))).toBe(true);
  });

  it("hides homework that ended before the student joined the class", () => {
    // The transfer-backfill case: published in January, student joined in February.
    expect(isAssignmentVisibleToStudent(input())).toBe(false);
  });

  it("shows old homework that is still open, so the student can do it", () => {
    expect(isAssignmentVisibleToStudent(input({ dueAt: FUTURE }))).toBe(true);
    expect(isAssignmentVisibleToStudent(input({ dueAt: null }))).toBe(true);
  });

  it("shows homework published after the student joined, and keeps it once it ends", () => {
    const beforeDeadline = input({ publishedAt: PUBLISHED_AFTER_JOIN, dueAt: FUTURE });
    expect(isAssignmentVisibleToStudent(beforeDeadline)).toBe(true);
    const afterDeadline = input({ publishedAt: PUBLISHED_AFTER_JOIN, dueAt: PAST });
    expect(isAssignmentVisibleToStudent(afterDeadline)).toBe(true);
  });

  it("never hides work the student already did", () => {
    expect(isAssignmentVisibleToStudent(input({ hasActivity: true }))).toBe(true);
  });

  it("hides drafts and homework of classes the student is not enrolled in", () => {
    expect(isAssignmentVisibleToStudent(input({ assignmentStatus: "draft", dueAt: FUTURE }))).toBe(false);
    expect(isAssignmentVisibleToStudent(input({ joinedAt: null, dueAt: FUTURE }))).toBe(false);
  });

  it("falls back to created_at when published_at is missing", () => {
    expect(
      isAssignmentVisibleToStudent(
        input({ publishedAt: null, createdAt: PUBLISHED_AFTER_JOIN })
      )
    ).toBe(true);
    expect(
      isAssignmentVisibleToStudent(
        input({ publishedAt: null, createdAt: PUBLISHED_BEFORE_JOIN })
      )
    ).toBe(false);
  });
});
