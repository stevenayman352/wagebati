import { describe, it, expect } from "vitest";
import {
  isAssignmentVisibleToStudent,
  type StudentAssignmentVisibilityInput
} from "@/lib/student-visibility";

const JOINED = "2026-02-01T00:00:00Z";
const PUBLISHED_BEFORE_JOIN = "2026-01-10T00:00:00Z";
const PUBLISHED_AFTER_JOIN = "2026-02-05T00:00:00Z";
const ENDED_BEFORE_JOIN = "2026-01-20T00:00:00Z";
const OPEN_AT_JOIN = "2026-02-03T00:00:00Z";

function input(overrides: Partial<StudentAssignmentVisibilityInput> = {}): StudentAssignmentVisibilityInput {
  return {
    assignmentStatus: "published",
    dueAt: ENDED_BEFORE_JOIN,
    publishedAt: PUBLISHED_BEFORE_JOIN,
    createdAt: PUBLISHED_BEFORE_JOIN,
    joinedAt: JOINED,
    hasActivity: false,
    ...overrides
  };
}

describe("isAssignmentVisibleToStudent", () => {
  it("shows homework published while the student was in the class, even long after the deadline", () => {
    expect(isAssignmentVisibleToStudent(input({ publishedAt: JOINED, createdAt: JOINED }))).toBe(true);
  });

  it("hides homework that ended before the student joined the class", () => {
    // The transfer-backfill case: published and closed in January, joined in February.
    expect(isAssignmentVisibleToStudent(input())).toBe(false);
  });

  it("shows homework that was still open when the student joined, and keeps it after the deadline", () => {
    expect(isAssignmentVisibleToStudent(input({ dueAt: OPEN_AT_JOIN }))).toBe(true);
    // Same deadline exactly at the join instant still counts as open.
    expect(isAssignmentVisibleToStudent(input({ dueAt: JOINED }))).toBe(true);
    // No deadline at all never expires.
    expect(isAssignmentVisibleToStudent(input({ dueAt: null }))).toBe(true);
  });

  it("shows homework published after the student joined, and keeps it once it ends", () => {
    expect(isAssignmentVisibleToStudent(input({ publishedAt: PUBLISHED_AFTER_JOIN, dueAt: OPEN_AT_JOIN }))).toBe(true);
    expect(isAssignmentVisibleToStudent(input({ publishedAt: PUBLISHED_AFTER_JOIN, dueAt: ENDED_BEFORE_JOIN }))).toBe(true);
  });

  it("never hides work the student already did", () => {
    expect(isAssignmentVisibleToStudent(input({ hasActivity: true }))).toBe(true);
  });

  it("hides drafts and homework of classes the student is not enrolled in", () => {
    expect(isAssignmentVisibleToStudent(input({ assignmentStatus: "draft", dueAt: OPEN_AT_JOIN }))).toBe(false);
    expect(isAssignmentVisibleToStudent(input({ joinedAt: null, dueAt: OPEN_AT_JOIN }))).toBe(false);
  });

  it("falls back to created_at when published_at is missing", () => {
    expect(isAssignmentVisibleToStudent(input({ publishedAt: null, createdAt: PUBLISHED_AFTER_JOIN }))).toBe(true);
    expect(isAssignmentVisibleToStudent(input({ publishedAt: null, createdAt: PUBLISHED_BEFORE_JOIN }))).toBe(false);
  });
});
