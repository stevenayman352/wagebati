"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assignmentSchema,
  assignmentUpdateSchema,
  attachmentSchema,
  gradeSchema,
  reopenAssignmentSchema,
  uuidFormSchema
} from "@/lib/validators";
import type { ActionState } from "@/lib/types";

function invalidateTeacherCache(userId: string) {
  updateTag(`teacher-dashboard:${userId}`);
  updateTag(`conversations:${userId}`);
  updateTag(`assignments:${userId}`);
  updateTag(`statistics:${userId}`);
  updateTag(`teacher-classes:${userId}`);
}

function invalidateStudentDashboard(studentId: string) {
  updateTag(`student-dashboard:${studentId}`);
}

export async function createAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = assignmentSchema.safeParse({
    classId: formData.get("classId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueAt: formData.get("dueAt"),
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الواجب." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("assignments").insert({
    class_id: parsed.data.classId,
    teacher_id: profile.id,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    due_at: parsed.data.dueAt,
    max_grade: parsed.data.maxGrade,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: profile.id
  });

  if (error) return { ok: false, message: error.message };
  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  return { ok: true, message: "تم نشر الواجب." };
}

export async function updateAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = assignmentUpdateSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueAt: formData.get("dueAt"),
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الواجب." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      due_at: parsed.data.dueAt,
      max_grade: parsed.data.maxGrade
    })
    .eq("id", parsed.data.assignmentId);

  if (error) return { ok: false, message: error.message };
  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  return { ok: true, message: "تم حفظ التعديلات." };
}

export async function publishAssignmentAction(formData: FormData) {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("assignmentId") });
  if (!parsed.success) redirect("/teacher?error=invalid");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("assignments")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("teacher_id", profile.id);

  if (error) redirect("/teacher?error=publish_failed");
  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  redirect("/teacher");
}

export async function deleteAssignmentAction(formData: FormData) {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("assignmentId") });
  if (!parsed.success) redirect("/teacher?error=invalid");

  const admin = createSupabaseAdminClient();
  const { data: attachments } = await admin
    .from("assignment_attachments")
    .select("storage_path")
    .eq("assignment_id", parsed.data.id);

  if (attachments?.length) {
    await admin.storage.from("assignment-attachments").remove(attachments.map((a) => a.storage_path));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", parsed.data.id)
    .eq("teacher_id", profile.id);

  if (error) redirect("/teacher?error=delete_failed");
  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  redirect("/teacher");
}

export async function addAttachmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = attachmentSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    fileSize: formData.get("fileSize")
  });

  if (!parsed.success) return { ok: false, message: "ملف غير صالح (يُسمح فقط بصور JPG/PNG/WebP حتى 10MB)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("assignment_attachments").insert({
    assignment_id: parsed.data.assignmentId,
    uploaded_by: profile.id,
    storage_path: parsed.data.storagePath,
    file_name: parsed.data.fileName,
    mime_type: parsed.data.mimeType,
    file_size: parsed.data.fileSize
  });

  if (error) return { ok: false, message: error.message };
  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  return { ok: true, message: "تم إرفاق الصورة." };
}

export async function removeAttachmentAction(formData: FormData) {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("attachmentId") });
  if (!parsed.success) redirect("/teacher?error=invalid");

  const admin = createSupabaseAdminClient();
  const { data: attachment } = await admin
    .from("assignment_attachments")
    .select("assignment_id, storage_path")
    .eq("id", parsed.data.id)
    .single();

  if (attachment) {
    await admin.storage.from("assignment-attachments").remove([attachment.storage_path]);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("assignment_attachments").delete().eq("id", parsed.data.id);
    if (error) redirect("/teacher?error=remove_failed");
  }

  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  redirect("/teacher");
}

export async function saveGradeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const conversationId = formData.get("conversationId") as string;
  if (!conversationId) return { ok: false, message: "معرف المحادثة مطلوب." };

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("assignment_id, student_id, assignment:assignments(title, max_grade)")
    .eq("id", conversationId)
    .single();

  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const assignmentEmbed = conversation.assignment as unknown as
    | { max_grade?: number }
    | { max_grade?: number }[]
    | null;
  const maxGradeFromDb = Array.isArray(assignmentEmbed)
    ? assignmentEmbed[0]?.max_grade
    : assignmentEmbed?.max_grade;

  const parsed = gradeSchema.safeParse({
    conversationId,
    grade: formData.get("grade"),
    note: "",
    maxGrade: maxGradeFromDb
  });

  if (!parsed.success) {
    const gradeIssues = parsed.error.issues.find((i) => i.path[0] === "grade");
    return {
      ok: false,
      message: gradeIssues ? "الدرجة يجب ألا تتجاوز الدرجة العظمى المحددة للواجب." : "تحقق من الدرجة."
    };
  }

  const { error } = await supabase.from("grades").upsert(
    {
      conversation_id: parsed.data.conversationId,
      assignment_id: conversation.assignment_id,
      student_id: conversation.student_id,
      grade: parsed.data.grade,
      comment: "",
      graded_by: profile.id
    },
    { onConflict: "conversation_id" }
  );

  if (error) return { ok: false, message: error.message };

  await supabase.from("conversations").update({ needs_revision: false }).eq("id", parsed.data.conversationId);

  invalidateTeacherCache(profile.id);
  invalidateStudentDashboard(conversation.student_id as string);
  revalidatePath("/teacher");
  revalidatePath("/student", "layout");
  return { ok: true, message: "تم حفظ الدرجة." };
}

export async function reopenConversationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("conversationId") });
  if (!parsed.success) return { ok: false, message: "اختيار غير صالح." };

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("student_id, assignment_id, assignment:assignments(title)")
    .eq("id", parsed.data.id)
    .single();
  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const { error } = await supabase
    .from("conversations")
    .update({ status: "active", closed_at: null, closed_by: null, needs_revision: false })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

  invalidateTeacherCache(profile.id);
  invalidateStudentDashboard(conversation.student_id as string);
  revalidatePath("/teacher");
  return { ok: true, message: "أعيد فتح المحادثة." };
}

export async function gradeConversationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const conversationId = formData.get("conversationId") as string;
  if (!conversationId) return { ok: false, message: "معرف المحادثة مطلوب." };

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("assignment_id, student_id, assignment:assignments(title, max_grade)")
    .eq("id", conversationId)
    .single();

  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const assignmentEmbed = conversation.assignment as unknown as
    | { max_grade?: number }
    | { max_grade?: number }[]
    | null;
  const maxGradeFromDb = Array.isArray(assignmentEmbed)
    ? assignmentEmbed[0]?.max_grade
    : assignmentEmbed?.max_grade;

  const parsed = gradeSchema.safeParse({
    conversationId,
    grade: formData.get("grade"),
    note: formData.get("note"),
    maxGrade: maxGradeFromDb
  });

  if (!parsed.success) {
    const gradeIssues = parsed.error.issues.find((i) => i.path[0] === "grade");
    return {
      ok: false,
      message: gradeIssues ? "الدرجة يجب ألا تتجاوز الدرجة العظمى المحددة للواجب." : "تحقق من الدرجة والملاحظة."
    };
  }

  const { error } = await supabase.from("grades").upsert(
    {
      conversation_id: parsed.data.conversationId,
      assignment_id: conversation.assignment_id,
      student_id: conversation.student_id,
      grade: parsed.data.grade,
      comment: parsed.data.note,
      graded_by: profile.id
    },
    { onConflict: "conversation_id" }
  );

  if (error) return { ok: false, message: error.message };

  await supabase.from("conversations").update({ needs_revision: false }).eq("id", parsed.data.conversationId);

  invalidateTeacherCache(profile.id);
  invalidateStudentDashboard(conversation.student_id as string);
  revalidatePath("/teacher");
  return { ok: true, message: "تم حفظ الدرجة." };
}

export async function requestRevisionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("conversationId") });
  if (!parsed.success) return { ok: false, message: "اختيار غير صالح." };

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("student_id, assignment_id, assignment:assignments(title)")
    .eq("id", parsed.data.id)
    .single();
  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const { error } = await supabase.from("conversations").update({ needs_revision: true }).eq("id", parsed.data.id);
  if (error) return { ok: false, message: error.message };

  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  return { ok: true, message: "تم طلب مراجعة جديدة." };
}

export async function closeConversationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("conversationId") });
  if (!parsed.success) return { ok: false, message: "اختيار غير صالح." };

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("student_id, assignment_id, assignment:assignments(title)")
    .eq("id", parsed.data.id)
    .single();
  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

  const { error } = await supabase
    .from("conversations")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: profile.id, needs_revision: false })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: error.message };

  invalidateTeacherCache(profile.id);
  invalidateStudentDashboard(conversation.student_id as string);
  revalidatePath("/teacher");
  return { ok: true, message: "تم إنهاء المحادثة." };
}

export async function closeAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = uuidFormSchema.safeParse({ id: formData.get("assignmentId") });
  if (!parsed.success) return { ok: false, message: "طلب غير صالح." };

  const supabase = await createSupabaseServerClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, class_id")
    .eq("id", parsed.data.id)
    .single();
  if (!assignment) return { ok: false, message: "الواجب غير موجود." };

  if (profile.role !== "admin") {
    const { data: taught } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id);
    if (!(taught ?? []).length) return { ok: false, message: "غير مصرح لك بهذا الواجب." };
  }

  const { data: active } = await supabase
    .from("conversations")
    .select("id, student_id")
    .eq("assignment_id", parsed.data.id)
    .eq("status", "active");
  if (!active || active.length === 0) return { ok: false, message: "لا توجد محادثات نشطة لهذا الواجب." };

  const nowIso = new Date().toISOString();
  const { error: closeError } = await supabase
    .from("conversations")
    .update({ status: "closed", closed_at: nowIso, closed_by: null, needs_revision: false, updated_at: nowIso })
    .eq("assignment_id", parsed.data.id)
    .eq("status", "active");
  if (closeError) return { ok: false, message: closeError.message };

  const { error: dueError } = await supabase
    .from("assignments")
    .update({ due_at: nowIso })
    .eq("id", parsed.data.id);
  if (dueError) return { ok: false, message: dueError.message };

  await supabase.from("notifications").insert(
    active.map((c) => ({
      user_id: c.student_id,
      type: "closed",
      title: "انتهى موعد الواجب",
      body: `أغلق المدرس الواجب "${assignment.title}" ولن يمكنك إرسال رسائل أو تعديلات جديدة.`,
      href: `/student/assignments/${c.id}`,
      assignment_id: parsed.data.id,
      conversation_id: c.id
    }))
  );

  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  revalidatePath("/teacher/assignments");
  revalidatePath("/teacher/assignments/[id]");
  return { ok: true, message: `تم إنهاء الواجب وإغلاق الاستلام لـ ${active.length} محادثة.` };
}

export async function reopenAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = reopenAssignmentSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    dueAt: formData.get("dueAt")
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "طلب غير صالح.";
    if (message.includes("في المستقبل")) return { ok: false, message: "الموعد يجب أن يكون في المستقبل." };
    if (message.includes("صالح")) return { ok: false, message: "تحقق من الموعد." };
    return { ok: false, message: "طلب غير صالح." };
  }
  const { assignmentId, dueAt } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, class_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment) return { ok: false, message: "الواجب غير موجود." };

  if (profile.role !== "admin") {
    const { data: taught } = await supabase
      .from("class_teachers")
      .select("class_id")
      .eq("class_id", assignment.class_id)
      .eq("teacher_id", profile.id);
    if (!(taught ?? []).length) return { ok: false, message: "غير مصرح لك بهذا الواجب." };
  }

  const { data: closedRows } = await supabase
    .from("conversations")
    .select("id, student_id, closed_by, grades(conversation_id)")
    .eq("assignment_id", assignmentId)
    .eq("status", "closed");

  const toReopen = (closedRows ?? []).filter(
    (c) =>
      c.closed_by == null &&
      !(Array.isArray(c.grades) && c.grades.length > 0)
  ) as { id: string; student_id: string }[];

  const { error: reopenError } = toReopen.length
    ? await supabase
        .from("conversations")
        .update({ status: "active", closed_at: null, closed_by: null, needs_revision: false, updated_at: new Date().toISOString() })
        .in("id", toReopen.map((c) => c.id))
    : { error: null };
  if (reopenError) return { ok: false, message: reopenError.message };

  const { error: dueError } = await createSupabaseAdminClient()
    .from("assignments")
    .update({ due_at: dueAt })
    .eq("id", assignmentId);
  if (dueError) return { ok: false, message: dueError.message };

  if (toReopen.length) {
    const dueLabel = dueAt
      ? ` والموعد الجديد ${new Date(dueAt).toLocaleString("ar-EG")}`
      : " وسيبقى مفتوحًا حتى يُغلق يدويًا";
    await supabase.from("notifications").insert(
      toReopen.map((c) => ({
        user_id: c.student_id,
        type: "reopened",
        title: "أعيد فتح الواجب",
        body: `أعيد فتح الواجب "${assignment.title}" ويمكنك إرسال رسائل أو تعديلات جديدة${dueLabel}.`,
        href: `/student/assignments/${c.id}`,
        assignment_id: assignmentId,
        conversation_id: c.id
      }))
    );
  }

  invalidateTeacherCache(profile.id);
  revalidatePath("/teacher");
  revalidatePath("/teacher/assignments");
  revalidatePath("/teacher/assignments/[id]");
  return { ok: true, message: `أعيد فتح الواجب وتم تفعيل ${toReopen.length} محادثة.` };
}

export async function forceCloseOverdueAction(_: ActionState): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("close_overdue_conversations");

  if (error) return { ok: false, message: `فشل إغلاق الواجبات المتأخرة: ${error.message}` };

  invalidateTeacherCache(profile.id);
  return { ok: true, message: `تم إغلاق ${data ?? 0} محادثة متأخرة بنجاح.` };
}