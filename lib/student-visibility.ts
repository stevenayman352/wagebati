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
 *   - the homework had not ended yet when they joined (or has no deadline at
 *     all), so they had a chance to do it — the enrollment trigger uses the
 *     same test, so what it backfills is exactly what the student sees;
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
};

export function isAssignmentVisibleToStudent(input: StudentAssignmentVisibilityInput): boolean {
  // Not (or no longer) in this class — the old class's homework is history.
  if (!input.joinedAt) return false;
  if (input.assignmentStatus !== "published") return false;
  if (input.hasActivity) return true;

  const joinedMs = Date.parse(input.joinedAt);

  // No deadline, or it was still open when the student joined the class: it
  // was theirs to do, and it stays visible after the deadline passes.
  if (input.dueAt === null) return true;
  if (Date.parse(input.dueAt) >= joinedMs) return true;

  // Published after they joined: theirs from the start.
  const publishedMs = Date.parse(input.publishedAt ?? input.createdAt);
  return publishedMs >= joinedMs;
}
