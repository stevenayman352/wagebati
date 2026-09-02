"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assignmentSchema,
  assignmentUpdateSchema,
  attachmentSchema,
  gradeSchema,
  uuidFormSchema
} from "@/lib/validators";
import type { ActionState } from "@/lib/types";

export async function createAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = assignmentSchema.safeParse({
    classId: formData.get("classId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueDate: formData.get("dueDate"),
    dueTime: formData.get("dueTime"),
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الواجب." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("assignments").insert({
    class_id: parsed.data.classId,
    teacher_id: profile.id,
    title: parsed.data.title,
    instructions: parsed.data.instructions,
    due_at: new Date(`${parsed.data.dueDate}T${parsed.data.dueTime}`).toISOString(),
    max_grade: parsed.data.maxGrade,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: profile.id
  });

  if (error) return { ok: false, message: error.message };
  revalidatePath("/teacher");
  return { ok: true, message: "تم نشر الواجب." };
}

export async function updateAssignmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["teacher", "admin"]);
  const parsed = assignmentUpdateSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    dueDate: formData.get("dueDate"),
    dueTime: formData.get("dueTime"),
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الواجب." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      title: parsed.data.title,
      instructions: parsed.data.instructions,
      due_at: new Date(`${parsed.data.dueDate}T${parsed.data.dueTime}`).toISOString(),
      max_grade: parsed.data.maxGrade
    })
    .eq("id", parsed.data.assignmentId);

  if (error) return { ok: false, message: error.message };
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
  revalidatePath("/teacher");
  return { ok: true, message: "تم إرفاق الصورة." };
}

export async function removeAttachmentAction(formData: FormData) {
  await requireRole(["teacher", "admin"]);
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

  revalidatePath("/teacher");
  redirect("/teacher");
}

export async function saveGradeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = gradeSchema.safeParse({
    conversationId: formData.get("conversationId"),
    grade: formData.get("grade"),
    note: "",
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) {
    const gradeIssues = parsed.error.issues.find((i) => i.path[0] === "grade");
    return {
      ok: false,
      message: gradeIssues ? "الدرجة يجب ألا تتجاوز الدرجة العظمى المحددة للواجب." : "تحقق من الدرجة."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("assignment_id, student_id, assignment:assignments(title, max_grade)")
    .eq("id", parsed.data.conversationId)
    .single();

  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

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
  await supabase.from("notifications").insert({
    user_id: conversation.student_id,
    type: "grade",
    title: "تم تسجيل الدرجة",
    body: `تم تقييمك في "${(conversation.assignment as unknown as { title?: string })?.title ?? "الواجب"}": ${parsed.data.grade}`,
    href: `/student/assignments/${parsed.data.conversationId}`,
    assignment_id: conversation.assignment_id,
    conversation_id: parsed.data.conversationId
  });

  revalidatePath("/teacher");
  revalidatePath("/student", "layout");
  return { ok: true, message: "تم حفظ الدرجة." };
}

export async function reopenConversationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["teacher", "admin"]);
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

  await supabase.from("notifications").insert({
    user_id: conversation.student_id,
    type: "message",
    title: "أعيد فتح المحادثة",
    body: `أعاد المدرس فتح محادثة "${(conversation.assignment as unknown as { title?: string })?.title ?? "الواجب"}". يمكنكما إرسال الرسائل مجددًا.`,
    href: `/student/assignments/${parsed.data.id}`,
    assignment_id: conversation.assignment_id,
    conversation_id: parsed.data.id
  });

  revalidatePath("/teacher");
  return { ok: true, message: "أعيد فتح المحادثة." };
}

export async function gradeConversationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["teacher", "admin"]);
  const parsed = gradeSchema.safeParse({
    conversationId: formData.get("conversationId"),
    grade: formData.get("grade"),
    note: formData.get("note"),
    maxGrade: formData.get("maxGrade")
  });

  if (!parsed.success) {
    const gradeIssues = parsed.error.issues.find((i) => i.path[0] === "grade");
    return {
      ok: false,
      message: gradeIssues ? "الدرجة يجب ألا تتجاوز الدرجة العظمى المحددة للواجب." : "تحقق من الدرجة والملاحظة."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("assignment_id, student_id, assignment:assignments(title, max_grade)")
    .eq("id", parsed.data.conversationId)
    .single();

  if (!conversation) return { ok: false, message: "المحادثة غير موجودة." };

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
  await supabase.from("notifications").insert({
    user_id: conversation.student_id,
    type: "grade",
    title: "تم تسجيل الدرجة",
    body: `تم تقييمك في "${(conversation.assignment as unknown as { title?: string })?.title ?? "الواجب"}": ${parsed.data.grade}`,
    href: `/student/assignments/${parsed.data.conversationId}`,
    assignment_id: conversation.assignment_id,
    conversation_id: parsed.data.conversationId
  });

  revalidatePath("/teacher");
  return { ok: true, message: "تم حفظ الدرجة." };
}

export async function requestRevisionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["teacher", "admin"]);
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

  await supabase.from("notifications").insert({
    user_id: conversation.student_id,
    type: "revision",
    title: "طلب مراجعة",
    body: `طلب منك المدرس إعادة النظر في حل "${(conversation.assignment as unknown as { title?: string })?.title ?? "الواجب"}".`,
    href: `/student/assignments/${parsed.data.id}`,
    assignment_id: conversation.assignment_id,
    conversation_id: parsed.data.id
  });

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

  await supabase.from("notifications").insert({
    user_id: conversation.student_id,
    type: "closed",
    title: "تم إنهاء المحادثة",
    body: `أنهى المدرس محادثة "${(conversation.assignment as unknown as { title?: string })?.title ?? "الواجب"}". لا يمكن إرسال تعديلات جديدة.`,
    href: `/student/assignments/${parsed.data.id}`,
    assignment_id: conversation.assignment_id,
    conversation_id: parsed.data.id
  });

  revalidatePath("/teacher");
  return { ok: true, message: "تم إنهاء المحادثة." };
}