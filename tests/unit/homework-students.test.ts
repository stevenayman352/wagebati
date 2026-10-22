import { describe, it, expect } from "vitest";
import { TEACHER_STATUSES } from "@/lib/assignment-status";
import {
  homeworkStudentStatuses,
  statusTotals,
  studentHasActivity,
  studentNeedsFollowUp
} from "@/lib/homework-students";

const NOW = new Date("2026-01-15T00:00:00Z").getTime();
const FUTURE = "2026-01-31T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";

const enrolledSet = (...ids: string[]) => new Set(ids);

type Conversation = Parameters<typeof homeworkStudentStatuses>[0]["conversations"][number];

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "conv-1",
    student_id: "s1",
    status: "active",
    ...overrides
  };
}

describe("homeworkStudentStatuses", () => {
  it("counts every enrolled student exactly once — with and without a conversation", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1", "s2", "s3"),
      conversations: [conv({ id: "conv-1", student_id: "s1" })],
      dueAt: FUTURE,
      nowMs: NOW
    });
    expect(entries.size).toBe(3);
    expect(entries.get("s1")?.conversationId).toBe("conv-1");
    expect(entries.get("s2")?.statusKey).toBe("not_submitted");
    expect(entries.get("s2")?.conversationId).toBeNull();
    expect(entries.get("s3")?.statusKey).toBe("not_submitted");
  });

  it("never-opened students fall back to overdue_not_submitted once the deadline passed", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1", "s2"),
      conversations: [conv({ id: "conv-1", student_id: "s1", hasSubmission: true })],
      dueAt: PAST,
      nowMs: NOW
    });
    expect(entries.get("s1")?.statusKey).toBe("awaiting_grading");
    expect(entries.get("s2")?.statusKey).toBe("overdue_not_submitted");
  });

  it("skips conversations of students who transferred out of the class", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1"),
      // s2 kept their old conversation after moving to another class
      conversations: [
        conv({ id: "conv-old", student_id: "s2", status: "closed", closed_by: "teacher" }),
        conv({ id: "conv-current", student_id: "s1" })
      ],
      dueAt: FUTURE,
      nowMs: NOW
    });
    expect([...entries.keys()]).toEqual(["s1"]);
    expect(entries.get("s1")?.conversationId).toBe("conv-current");
  });

  it("counts a duplicated (assignment, student) conversation row once", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1"),
      conversations: [
        conv({ id: "conv-a", status: "active" }),
        conv({ id: "conv-b", status: "closed", closed_by: "teacher" })
      ],
      dueAt: FUTURE,
      nowMs: NOW
    });
    expect(entries.size).toBe(1);
    expect(entries.get("s1")?.conversationId).toBe("conv-a");
  });

  it("derives per-student statuses instead of per-conversation counts", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1", "s2", "s3", "s4"),
      conversations: [
        conv({ id: "c1", student_id: "s1", hasStudentMessage: true }), // under_review
        conv({ id: "c2", student_id: "s2", status: "closed", closed_by: "teacher" }), // completed
        conv({ id: "c3", student_id: "s3", hasStudentMessage: true }) // under_review
      ],
      dueAt: FUTURE,
      nowMs: NOW
    });
    const totals = statusTotals(entries);
    expect(totals.get("under_review")).toBe(2); // s1, s3
    expect(totals.get("completed")).toBe(1); // s2
    expect(totals.get("not_submitted")).toBe(1); // s4
    // every key sums back to the enrollment count
    let sum = 0;
    for (const key of TEACHER_STATUSES) sum += totals.get(key) ?? 0;
    expect(sum).toBe(4);
  });
});

describe("studentHasActivity / studentNeedsFollowUp", () => {
  it("matches the submitter and follow-up cards", () => {
    const entries = homeworkStudentStatuses({
      enrolled: enrolledSet("s1", "s2", "s3", "s4"),
      conversations: [
        conv({ id: "c1", student_id: "s1", hasStudentMessage: true }), // under_review
        conv({ id: "c2", student_id: "s2", status: "closed", closed_by: "teacher" }), // completed
        conv({ id: "c3", student_id: "s3", hasGrade: true }) // graded
      ],
      dueAt: FUTURE,
      nowMs: NOW
    });
    expect(studentHasActivity(entries.get("s1")!)).toBe(true);
    expect(studentNeedsFollowUp(entries.get("s1")!)).toBe(true);
    expect(studentHasActivity(entries.get("s2")!)).toBe(true);
    expect(studentNeedsFollowUp(entries.get("s2")!)).toBe(false);
    expect(studentHasActivity(entries.get("s3")!)).toBe(true);
    expect(studentNeedsFollowUp(entries.get("s3")!)).toBe(false);
    expect(studentHasActivity(entries.get("s4")!)).toBe(false);
    expect(studentNeedsFollowUp(entries.get("s4")!)).toBe(false);
  });
});
