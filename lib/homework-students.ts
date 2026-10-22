import {
  computeAssignmentStatus,
  type TeacherStatusKey
} from "@/lib/assignment-status";

/**
 * Per-homework student accounting.
 *
 * A published homework gets one conversation row per enrolled student (DB
 * triggers: `assignment_create_conversations` / `enrollment_create_conversations`),
 * so conversation rows are the status SOURCE — but they are not the student
 * list:
 *   - a student transferred to another class keeps the old conversation by
 *     design ("same year" transfers only swap the class_students link), so
 *     counting conversations double-counts them against the class they left;
 *   - a student who never opened the homework has no conversation row at all
 *     and would be invisible on every card, even though they are exactly the
 *     "لم يسلم بعد" students.
 *
 * These helpers fix both directions: every currently-enrolled student shows up
 * exactly once, conversations only drive the status.
 */

export type StudentHomeworkConversation = {
  id: string;
  student_id: string;
  status: string;
  closed_by?: string | null;
  hasGrade?: boolean;
  hasSubmission?: boolean;
  hasStudentMessage?: boolean;
};

export type HomeworkStudentEntry = {
  studentId: string;
  statusKey: TeacherStatusKey;
  /** Null when the student never opened the homework — no conversation row exists. */
  conversationId: string | null;
};

export type HomeworkStudentCountInput = {
  /** Students currently enrolled in the homework's class (student_id set). */
  enrolled: ReadonlySet<string>;
  /** Every in-scope conversation row of this homework. */
  conversations: StudentHomeworkConversation[];
  /** Null means "no deadline". */
  dueAt: string | null;
  nowMs: number;
};

/**
 * One entry per enrolled student. Conversation rows of students who are no
 * longer in the class are skipped, and (assignment, student) pairs are
 * counted once even if duplicate rows ever appear.
 */
export function homeworkStudentStatuses(input: HomeworkStudentCountInput): Map<string, HomeworkStudentEntry> {
  // Students without a conversation inherit this status: "لم يسلم بعد" while
  // the homework is open, "لم يتم تسليم الواجب" once the deadline has passed.
  const fallbackStatusKey = computeAssignmentStatus({
    role: "teacher",
    status: "active",
    closedBy: null,
    hasGrade: false,
    hasSubmission: false,
    hasStudentMessage: false,
    dueAt: input.dueAt,
    nowMs: input.nowMs
  }) as TeacherStatusKey;

  const entries = new Map<string, HomeworkStudentEntry>();
  for (const conversation of input.conversations) {
    if (!input.enrolled.has(conversation.student_id)) continue;
    if (entries.has(conversation.student_id)) continue;
    entries.set(conversation.student_id, {
      studentId: conversation.student_id,
      statusKey: computeAssignmentStatus({
        role: "teacher",
        status: conversation.status,
        closedBy: conversation.closed_by ?? null,
        hasGrade: Boolean(conversation.hasGrade),
        hasSubmission: Boolean(conversation.hasSubmission),
        hasStudentMessage: Boolean(conversation.hasStudentMessage),
        dueAt: input.dueAt,
        nowMs: input.nowMs
      }) as TeacherStatusKey,
      conversationId: conversation.id
    });
  }
  for (const studentId of input.enrolled) {
    if (!entries.has(studentId)) {
      entries.set(studentId, {
        studentId,
        statusKey: fallbackStatusKey,
        conversationId: null
      });
    }
  }
  return entries;
}

export function statusTotals(
  entries: ReadonlyMap<string, HomeworkStudentEntry>
): Map<TeacherStatusKey, number> {
  const totals = new Map<TeacherStatusKey, number>();
  for (const { statusKey } of entries.values()) {
    totals.set(statusKey, (totals.get(statusKey) ?? 0) + 1);
  }
  return totals;
}

/**
 * Students who have handed anything in (a grade, a submission or at least a
 * message). The other two statuses ("لم يسلم بعد" / "لم يتم تسليم الواجب")
 * are the complement.
 */
export function studentHasActivity(entry: HomeworkStudentEntry): boolean {
  return !["not_submitted", "overdue_not_submitted"].includes(entry.statusKey);
}

/**
 * Students the teacher still needs to act on: something is in progress or
 * sitting ungraded.
 */
export function studentNeedsFollowUp(entry: HomeworkStudentEntry): boolean {
  return entry.statusKey === "under_review" || entry.statusKey === "awaiting_grading";
}
