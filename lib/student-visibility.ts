/**
 * Which homework a student is allowed to see on their dashboard.
 *
 * Homework belongs to a class, and a student's link to that class is a
 * `class_students` row whose `created_at` is when they joined it (a transfer
 * deletes the old row and inserts the new one, so it is the transfer time).
 * Homework published before the student joined the class was never theirs:
 * it stays in the database for the teacher's records, but the student should
 * not see it — the enrollment trigger used to backfill a conversation for
 * EVERY published assignment of the target class, so a transferred student
 * was shown months of old homework as "لم يسلم بعد".
 *
 * Exceptions, both in the student's favour:
 *   - the homework is still open (no deadline yet, or the deadline has not
 *     passed), so they can legitimately do it;
 *   - the student already did something on it (submission, grade or message).
 *     Real work is never hidden.
 */
export type StudentAssignmentVisibilityInput = {
  /** assignments.status */
  assignmentStatus: string;
  /** assignments.due_at — null means "no deadline". */
  dueAt: string | null;
  /** assignments.published_at — null on legacy rows. */
  publishedAt: string | null;
  /** assignments.created_at, used when published_at is missing. */
  createdAt: string;
  /** class_students.created_at for the assignment's class; null when the student is not enrolled in it (old class). */
  joinedAt: string | null;
  /** The student submitted, was graded, or wrote in this conversation. */
  hasActivity: boolean;
  nowMs: number;
};

export function isAssignmentVisibleToStudent(input: StudentAssignmentVisibilityInput): boolean {
  // Not (or no longer) in this class — the old class's homework is history.
  if (!input.joinedAt) return false;
  if (input.assignmentStatus !== "published") return false;
  if (input.hasActivity) return true;

  const dueMs = input.dueAt ? Date.parse(input.dueAt) : null;
  const stillOpen = dueMs === null || dueMs >= input.nowMs;
  if (stillOpen) return true;

  const publishedMs = Date.parse(input.publishedAt ?? input.createdAt);
  return publishedMs >= Date.parse(input.joinedAt);
}
