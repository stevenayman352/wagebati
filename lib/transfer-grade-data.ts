import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchAllInChunks } from "@/lib/supabase/fetch-all";
import {
  buildTransferGradePreview,
  resolveGradeValue,
  type TransferGradePlan,
  type TransferGradePreview
} from "@/lib/transfer-grades";
import type { TransferClass } from "@/lib/transfer";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type TransferGradePreviewOptions = {
  target: TransferClass;
  studentIds: string[];
  /** Classes-page dialog: only this class is being left. */
  onlySourceClassId?: string;
  /**
   * Excel import: the row's old class is the only source, even if the student
   * is linked to other classes too. Overrides the live class_students links.
   */
  links?: Array<{ studentId: string; classId: string }>;
};

const EMPTY_PREVIEW: TransferGradePreview = {
  groups: [],
  students: [],
  needsReview: false,
  autoPlan: []
};

/**
 * Loads every row the mapping dialog needs: the selected students' current
 * classes, the published homework of those classes and of the target class,
 * the marks the selected students already have on both sides, and the
 * existing target marks used to detect conflicts.
 *
 * Reads go through the service-role client because `grades` RLS does not
 * include admins.
 */
export async function loadTransferGradePreview(
  admin: AdminClient,
  options: TransferGradePreviewOptions
): Promise<TransferGradePreview> {
  const studentIds = [...new Set(options.studentIds)];
  if (studentIds.length === 0) return EMPTY_PREVIEW;

  const linkRows = options.links
    ? options.links.map((link) => ({ student_id: link.studentId, class_id: link.classId }))
    : await fetchAllInChunks<{ student_id: string; class_id: string }>(studentIds, (chunk, range) =>
        admin
          .from("class_students")
          .select("student_id, class_id")
          .in("student_id", chunk)
          .order("class_id")
          .order("student_id")
          .range(range.from, range.to)
      );

  const selected = new Set(studentIds);
  const links = linkRows
    .map((row) => ({ studentId: String(row.student_id), classId: String(row.class_id) }))
    .filter((link) => selected.has(link.studentId));

  let sourceClassIds = [...new Set(links.map((link) => link.classId))].filter(
    (classId) => classId !== options.target.id
  );
  if (options.onlySourceClassId) {
    sourceClassIds = sourceClassIds.filter((classId) => classId === options.onlySourceClassId);
  }

  const [classRows, profileRows] = await Promise.all([
    sourceClassIds.length
      ? fetchAllInChunks<{ id: string; name: string; grade_label: string | null }>(
          sourceClassIds,
          (chunk, range) =>
            admin
              .from("classes")
              .select("id, name, grade_label")
              .in("id", chunk)
              .order("id")
              .range(range.from, range.to)
        )
      : Promise.resolve([]),
    fetchAllInChunks<{ id: string; full_name: string | null }>(studentIds, (chunk, range) =>
      admin
        .from("profiles")
        .select("id, full_name")
        .in("id", chunk)
        .order("id")
        .range(range.from, range.to)
    )
  ]);

  const sourceClasses = classRows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    gradeLabel: String(row.grade_label ?? "")
  }));

  const [sourceAssignmentRows, targetAssignmentRows] = await Promise.all([
    sourceClassIds.length
      ? fetchAllInChunks<{ id: string; class_id: string; title: string; max_grade: number | null }>(
          sourceClassIds,
          (chunk, range) =>
            admin
              .from("assignments")
              .select("id, class_id, title, max_grade")
              .in("class_id", chunk)
              .eq("status", "published")
              .order("id")
              .range(range.from, range.to)
        )
      : Promise.resolve([]),
    fetchAll<{ id: string; title: string; max_grade: number | null }>((range) =>
      admin
        .from("assignments")
        .select("id, title, max_grade")
        .eq("class_id", options.target.id)
        .eq("status", "published")
        .order("id")
        .range(range.from, range.to)
    )
  ]);

  const sourceAssignments = sourceAssignmentRows.map((row) => ({
    id: String(row.id),
    classId: String(row.class_id),
    title: String(row.title ?? ""),
    maxGrade: Number(row.max_grade ?? 20)
  }));
  const targetAssignments = targetAssignmentRows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    maxGrade: Number(row.max_grade ?? 20)
  }));

  const sourceAssignmentIds = sourceAssignments.map((assignment) => assignment.id);
  const targetAssignmentIds = targetAssignments.map((assignment) => assignment.id);

  const [sourceGradeRows, targetGradeRows] = await Promise.all([
    sourceAssignmentIds.length
      ? fetchAllInChunks<{ assignment_id: string; student_id: string; grade: number }>(
          sourceAssignmentIds,
          (chunk, range) =>
            admin
              .from("grades")
              .select("assignment_id, student_id, grade")
              .in("assignment_id", chunk)
              .order("id")
              .range(range.from, range.to)
        )
      : Promise.resolve([]),
    targetAssignmentIds.length
      ? fetchAllInChunks<{ assignment_id: string; student_id: string; grade: number }>(
          targetAssignmentIds,
          (chunk, range) =>
            admin
              .from("grades")
              .select("assignment_id, student_id, grade")
              .in("assignment_id", chunk)
              .order("id")
              .range(range.from, range.to)
        )
      : Promise.resolve([])
  ]);

  return buildTransferGradePreview({
    target: options.target,
    sourceClasses,
    students: profileRows.map((row) => ({ id: String(row.id), name: String(row.full_name ?? "") })),
    links,
    sourceAssignments,
    targetAssignments,
    sourceGrades: sourceGradeRows
      .filter((row) => selected.has(String(row.student_id)))
      .map((row) => ({
        assignmentId: String(row.assignment_id),
        studentId: String(row.student_id),
        grade: Number(row.grade)
      })),
    targetGrades: targetGradeRows
      .filter((row) => selected.has(String(row.student_id)))
      .map((row) => ({
        assignmentId: String(row.assignment_id),
        studentId: String(row.student_id),
        grade: Number(row.grade)
      }))
  });
}

/**
 * Copies the planned marks for ONE student. The caller must run this before
 * moving the class_students link: if it throws, the student is still in the
 * old class and the admin can retry safely (target marks already written are
 * overwritten or kept by the plan's conflict policy).
 */
export async function copyTransferGrades(
  admin: AdminClient,
  args: {
    studentId: string;
    target: TransferClass;
    sourceClassIds: string[];
    plan: TransferGradePlan;
    /** Used only if the source grade has no graded_by (should not happen). */
    fallbackGradedBy: string;
  }
): Promise<{ copied: number; kept: number; failed: number }> {
  const rows = args.plan
    .filter(
      (group) =>
        group.targetClassId === args.target.id && args.sourceClassIds.includes(group.sourceClassId)
    )
    .flatMap((group) => group.rows);
  if (rows.length === 0) return { copied: 0, kept: 0, failed: 0 };

  const sourceAssignmentIds = [...new Set(rows.map((row) => row.sourceAssignmentId))];
  const targetAssignmentIds = [...new Set(rows.map((row) => row.targetAssignmentId))];

  const [sourceGradeRes, sourceAssignmentRes, targetAssignmentRes, conversationRes] =
    await Promise.all([
      admin
        .from("grades")
        .select("assignment_id, grade, comment, graded_by, graded_at")
        .eq("student_id", args.studentId)
        .in("assignment_id", sourceAssignmentIds),
      admin.from("assignments").select("id, max_grade").in("id", sourceAssignmentIds),
      admin.from("assignments").select("id, max_grade").in("id", targetAssignmentIds),
      admin
        .from("conversations")
        .select("id, assignment_id")
        .eq("student_id", args.studentId)
        .in("assignment_id", targetAssignmentIds)
    ]);

  for (const result of [
    sourceGradeRes,
    sourceAssignmentRes,
    targetAssignmentRes,
    conversationRes
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const sourceGrades = new Map(
    (sourceGradeRes.data ?? []).map((grade) => [String(grade.assignment_id), grade])
  );
  const sourceMax = new Map(
    (sourceAssignmentRes.data ?? []).map((assignment) => [
      String(assignment.id),
      Number(assignment.max_grade ?? 0)
    ])
  );
  const targetMax = new Map(
    (targetAssignmentRes.data ?? []).map((assignment) => [
      String(assignment.id),
      Number(assignment.max_grade ?? 0)
    ])
  );
  const conversationByAssignment = new Map(
    (conversationRes.data ?? []).map((conversation) => [
      String(conversation.assignment_id),
      String(conversation.id)
    ])
  );

  let failed = 0;
  const missingConversations = targetAssignmentIds.filter(
    (assignmentId) => !conversationByAssignment.has(assignmentId)
  );
  if (missingConversations.length > 0) {
    const { data: created, error } = await admin
      .from("conversations")
      .upsert(
        missingConversations.map((assignmentId) => ({
          assignment_id: assignmentId,
          student_id: args.studentId
        })),
        { onConflict: "assignment_id,student_id" }
      )
      .select("id, assignment_id");
    if (!error) {
      for (const conversation of created ?? []) {
        conversationByAssignment.set(
          String(conversation.assignment_id),
          String(conversation.id)
        );
      }
    }
    // If the upsert failed, the row loop below counts each grade it could not
    // copy (one per row, not one per conversation).
  }

  const conversationIds = [...conversationByAssignment.values()];
  const existingRes = conversationIds.length
    ? await admin
        .from("grades")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
    : { data: [] as { conversation_id: string }[], error: null };
  if (existingRes.error) throw new Error(existingRes.error.message);
  const existing = new Set(
    (existingRes.data ?? []).map((grade) => String(grade.conversation_id))
  );

  const keptConversations = new Set<string>();
  const upserts = new Map<
    string,
    {
      conversation_id: string;
      assignment_id: string;
      student_id: string;
      grade: number;
      comment: string;
      graded_by: string;
      graded_at: string;
    }
  >();

  for (const row of rows) {
    const source = sourceGrades.get(row.sourceAssignmentId);
    if (!source) continue;

    const conversationId = conversationByAssignment.get(row.targetAssignmentId);
    if (!conversationId) {
      failed += 1;
      continue;
    }

    if (existing.has(conversationId) && row.onConflict === "keep") {
      keptConversations.add(conversationId);
      continue;
    }

    const value = resolveGradeValue(
      Number(source.grade),
      sourceMax.get(row.sourceAssignmentId) ?? 0,
      targetMax.get(row.targetAssignmentId) ?? 0,
      row.scale
    );

    upserts.set(conversationId, {
      conversation_id: conversationId,
      assignment_id: row.targetAssignmentId,
      student_id: args.studentId,
      grade: value,
      comment: String(source.comment ?? ""),
      graded_by: String(source.graded_by ?? args.fallbackGradedBy),
      graded_at: source.graded_at ? String(source.graded_at) : new Date().toISOString()
    });
  }

  const pending = [...upserts.values()];
  if (pending.length > 0) {
    const { error } = await admin
      .from("grades")
      .upsert(pending, { onConflict: "conversation_id" });
    if (error) {
      failed += pending.length;
      return { copied: 0, kept: keptConversations.size, failed };
    }
  }

  return { copied: pending.length, kept: keptConversations.size, failed };
}
