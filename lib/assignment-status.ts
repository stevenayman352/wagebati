export type TeacherStatusKey =
  | "not_submitted"
  | "under_review"
  | "awaiting_grading"
  | "overdue_not_submitted"
  | "graded"
  | "needs_revision"
  | "completed";

export type StudentStatusKey =
  | "not_submitted"
  | "under_review"
  | "submitted"
  | "missed"
  | "needs_revision"
  | "completed";

export type AssignmentRole = "teacher" | "student";

export type AssignmentStatusInput = {
  role: AssignmentRole;
  status: string;
  needsRevision?: boolean;
  closedBy?: string | null;
  hasGrade?: boolean;
  hasSubmission?: boolean;
  hasStudentMessage?: boolean;
  dueAt?: string | null;
  nowMs: number;
};

export function conversationHasActivity(
  input: Pick<AssignmentStatusInput, "hasGrade" | "hasSubmission" | "hasStudentMessage">
): boolean {
  return Boolean(input.hasGrade || input.hasSubmission || input.hasStudentMessage);
}

export function computeAssignmentStatus(
  input: AssignmentStatusInput
): TeacherStatusKey | StudentStatusKey {
  const activity = conversationHasActivity(input);
  const duePassed =
    input.dueAt != null && new Date(input.dueAt).getTime() < input.nowMs;
  const closed = input.status === "closed";
  const needsRevision = Boolean(input.needsRevision) && !closed;
  const teacherFinishedClose =
    closed && (Boolean(input.hasGrade) || input.closedBy != null);

  if (needsRevision) return "needs_revision";

  if (closed) {
    if (teacherFinishedClose) return "completed";
    if (activity)
      return input.role === "teacher" ? "awaiting_grading" : "submitted";
    return input.role === "teacher" ? "overdue_not_submitted" : "missed";
  }

  if (input.role === "teacher") {
    if (input.hasGrade) return "graded";
    if (duePassed) return activity ? "awaiting_grading" : "overdue_not_submitted";
    return activity ? "under_review" : "not_submitted";
  }

  if (duePassed) return activity ? "submitted" : "missed";
  return activity ? "under_review" : "not_submitted";
}

export const STATUS_LABEL: Record<string, string> = {
  not_submitted: "لم يسلم بعد",
  under_review: "تحت المراجعة",
  awaiting_grading: "في انتظار التقييم",
  overdue_not_submitted: "لم يتم تسليم الواجب",
  graded: "تم التقييم",
  needs_revision: "مطلوب تعديل",
  completed: "مكتمل",
  submitted: "تم التسليم",
  missed: "فات موعده"
};

export const TEACHER_STATUSES: TeacherStatusKey[] = [
  "not_submitted",
  "under_review",
  "awaiting_grading",
  "overdue_not_submitted",
  "graded",
  "needs_revision",
  "completed"
];

export const STUDENT_STATUSES: StudentStatusKey[] = [
  "not_submitted",
  "under_review",
  "submitted",
  "missed",
  "needs_revision",
  "completed"
];

export function isTeacherStatusKey(value: string): value is TeacherStatusKey {
  return (TEACHER_STATUSES as readonly string[]).includes(value);
}