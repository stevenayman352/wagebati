"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountSchema, classSchema, codeSchema, uuidSchema } from "@/lib/validators";
import { accountEmailForCode, generateAccountCode } from "@/lib/accounts";
import { MAX_IMPORT_FILE_BYTES, parseImportFile, validateImportRows } from "@/lib/import-accounts";
import {
  MAX_TRANSFER_FILE_BYTES,
  isCrossYearTransfer,
  parseTransferFile,
  validateTransferRows,
  type TransferClass
} from "@/lib/transfer";
import type { ActionState, AssignmentMatch, ImportIssue } from "@/lib/types";
import { verifyAdminPasswordAction } from "@/app/actions/auth";

function invalidateAdminCaches(adminId: string) {
  updateTag(`admin-home:${adminId}`);
  updateTag(`accounts:${adminId}`);
  updateTag(`classes:${adminId}`);
  updateTag(`transfer:${adminId}`);
}

export async function createAccountAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const parsed = accountSchema.safeParse({
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    role: formData.get("role"),
    code: formData.get("code")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الحساب (الاسم، الدور، كلمة مرور ٨ أحرف على الأقل، كود ٤-٢٤ حرفًا)." };
  const data = parsed.data;

  const admin = createSupabaseAdminClient();
  const available = await ensureUniqueCode(admin, data.code ?? generateAccountCode());
  if (!available.ok) return { ok: false, message: available.message ?? "تعذر إنشاء الحساب." };

  const email = accountEmailForCode(available.code!);

  const { data: authUser, error } = await admin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.fullName, role: data.role, code: available.code }
  });

  if (error || !authUser.user) return { ok: false, message: error?.message ?? "تعذر إنشاء الحساب." };

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    full_name: data.fullName,
    email,
    code: available.code!,
    role: data.role,
    is_active: true,
    must_change_password: true,
    initial_password: data.password
  });

  if (profileError) return { ok: false, message: profileError.message };

  const userId = authUser.user.id;

  if (data.role === "student") {
    const single = String(formData.get("classId") ?? "").trim();
    if (single) {
      const { error: linkErr } = await admin
        .from("class_students")
        .upsert({ class_id: single, student_id: userId });
      if (linkErr) return { ok: false, message: "تم إنشاء الحساب لكن فشل ربطه بالصف: " + linkErr.message };
    }
  } else if (data.role === "teacher") {
    const classIds = formData.getAll("classIds").map((v) => String(v).trim()).filter(Boolean);
    for (const classId of classIds) {
      const { error: linkErr } = await admin
        .from("class_teachers")
        .upsert({ class_id: classId, teacher_id: userId });
      if (linkErr) return { ok: false, message: "تم إنشاء الحساب لكن فشل ربطه ببعض الصفوف: " + linkErr.message };
    }
  }

invalidateAdminCaches(profile.id);
revalidatePath("/admin");
  return { ok: true, message: `تم إنشاء الحساب، كود الدخول: ${available.code}` };
}

export async function importAccountsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "اختر ملف إكسل أولًا." };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, message: "حجم الملف أكبر من ٥ ميجابايت." };
  }
  const fileName = String(file.name ?? "").toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    return { ok: false, message: "صيغة الملف غير مدعومة (.xlsx أو .xls فقط)." };
  }

  const parsed = await parseImportFile(await file.arrayBuffer());
  if (parsed.fileError) return { ok: false, message: parsed.fileError };
  if (parsed.headerError) return { ok: false, message: parsed.headerError };
  if (parsed.rows.length === 0) {
    return { ok: false, message: "لم يتم العثور على أي صفوف بيانات في أول ورقة." };
  }

  const admin = createSupabaseAdminClient();
  const [{ data: existing }, { data: classRows }] = await Promise.all([
    admin.from("profiles").select("code"),
    admin.from("classes").select("id, name")
  ]);

  const classIdByName = new Map<string, string>();
  (classRows ?? []).forEach((row) => {
    const key = String(row.name ?? "").trim().toLowerCase();
    if (key) classIdByName.set(key, String(row.id));
  });

  const { valid, issues } = validateImportRows(parsed.rows, {
    existingCodes: (existing ?? []).map((r) => String(r.code ?? "")),
    classNames: classIdByName.keys()
  });

  const reported: ImportIssue[] = [...issues];
  let created = 0;

  for (const row of valid) {
    const email = accountEmailForCode(row.code);
    const { data: authUser, error } = await admin.auth.admin.createUser({
      email,
      password: row.password,
      email_confirm: true,
      user_metadata: { full_name: row.name, role: row.role, code: row.code }
    });

    if (error || !authUser.user) {
      reported.push({ row: row.row, column: "file", message: `تعذر إنشاء الحساب: ${error?.message ?? "خطأ غير معروف"}` });
      continue;
    }

    const userId = authUser.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      full_name: row.name,
      email,
      code: row.code,
      role: row.role,
      is_active: true,
      must_change_password: true,
      initial_password: row.password
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      reported.push({ row: row.row, column: "file", message: `تعذر حفظ الحساب: ${profileError.message}` });
      continue;
    }

    if (row.className) {
      const classId = classIdByName.get(row.className.trim().toLowerCase());
      if (!classId) continue;
      if (row.role === "student") {
        const { error: linkError } = await admin
          .from("class_students")
          .upsert({ class_id: classId, student_id: userId });
        if (linkError) {
          reported.push({ row: row.row, column: "class", message: "تم إنشاء الحساب لكن فشل ربطه بالصف." });
        }
      } else if (row.role === "teacher") {
        const { error: linkError } = await admin
          .from("class_teachers")
          .upsert({ class_id: classId, teacher_id: userId });
        if (linkError) {
          reported.push({ row: row.row, column: "class", message: "تم إنشاء الحساب لكن فشل ربطه بالصف." });
        }
      }
    }

    created += 1;
  }

  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  const rejected = reported.length;
  const summary = `تم إنشاء ${created} من أصل ${parsed.rows.length} حساب.`;
  return {
    ok: created > 0,
    message: rejected > 0 ? `${summary} مرفوض: ${rejected}.` : summary,
    created,
    rejected,
    issues: reported
  };
}

async function ensureUniqueCode(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  preferredCode: string
): Promise<{ ok: boolean; code?: string; message?: string }> {
  for (let i = 0; i < 12; i++) {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("code", preferredCode);
    if (error) return { ok: false, message: error.message };
    if ((count ?? 0) === 0) return { ok: true, code: preferredCode };
    preferredCode = generateAccountCode();
  }
  return { ok: false, message: "تعذر توليد كود فريد." };
}

export async function createClassAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const parsed = classSchema.safeParse({
    name: formData.get("name"),
    gradeLabel: formData.get("gradeLabel")
  });

  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الصف." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("classes").insert({
    name: parsed.data.name,
    grade_label: parsed.data.gradeLabel,
    created_by: profile.id
  });

if (error) return { ok: false, message: error.message };
  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  return { ok: true, message: "تم إنشاء الصف." };
}

export async function assignUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const classId = uuidSchema.safeParse(formData.get("classId"));
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const role = String(formData.get("membership"));

  if (!classId.success || !userId.success || !["teacher", "student"].includes(role)) {
    return { ok: false, message: "تحقق من الاختيار." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } =
    role === "teacher"
      ? await supabase.from("class_teachers").upsert({ class_id: classId.data, teacher_id: userId.data })
      : await supabase.from("class_students").upsert({ class_id: classId.data, student_id: userId.data });

  if (error) return { ok: false, message: error.message };
  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  return { ok: true, message: "تم ربط المستخدم بالصف." };
}

export async function unassignUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const classId = uuidSchema.safeParse(formData.get("classId"));
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const role = String(formData.get("membership"));

  if (!classId.success || !userId.success || !["teacher", "student"].includes(role)) {
    return { ok: false, message: "تحقق من الاختيار." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } =
    role === "teacher"
      ? await supabase.from("class_teachers").delete().eq("class_id", classId.data).eq("teacher_id", userId.data)
      : await supabase.from("class_students").delete().eq("class_id", classId.data).eq("student_id", userId.data);

  if (error) return { ok: false, message: error.message };
  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  return { ok: true, message: "تم فك الربط." };
}

export async function toggleActiveAction(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const targetActive = formData.get("active") === "true";

  if (!userId.success) redirect("/admin?error=invalid");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: targetActive }).eq("id", userId.data);
  if (error) redirect("/admin/accounts?error=toggle_failed");
  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const password = String(formData.get("password") ?? "");

  if (!userId.success || password.length < 8) return { ok: false, message: "كلمة مرور قصيرة جدًا." };

  const admin = createSupabaseAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId.data, { password });
  if (authError) return { ok: false, message: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId.data);
  if (profileError) return { ok: false, message: profileError.message };

  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  return { ok: true, message: "تمت إعادة تعيين كلمة المرور وسيُطلب تغييرها عند الدخول." };
}

export async function updateCodeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const code = codeSchema.safeParse(formData.get("code"));

  if (!userId.success || !code.success) {
    return { ok: false, message: "تحقق من الكود (٤-٢٤ حرفًا إنجليزيًا أو أرقامًا فقط)." };
  }

  const admin = createSupabaseAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, code, email")
    .eq("id", userId.data)
    .single();

  if (targetError || !target) return { ok: false, message: "الحساب غير موجود." };
  if (target.role !== "student") return { ok: false, message: "يمكن تعديل كود الطلاب فقط." };
  if (target.code === code.data) return { ok: false, message: "هذا هو الكود الحالي بالفعل." };

  const { count, error: dupError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("code", code.data)
    .neq("id", userId.data);
  if (dupError) return { ok: false, message: dupError.message };
  if ((count ?? 0) > 0) return { ok: false, message: "الكود مستخدم بالفعل." };

  const email = accountEmailForCode(code.data);
  const { error: authError } = await admin.auth.admin.updateUserById(userId.data, { email });
  if (authError) return { ok: false, message: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ code: code.data, email })
    .eq("id", userId.data);
  if (profileError) return { ok: false, message: profileError.message };

  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/reset-password");
  return { ok: true, message: `تم تحديث كود الطالب: ${code.data}` };
}

export async function deleteAccountAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (!userId.success) return { ok: false, message: "طلب غير صالح." };
  if (profile.id === userId.data) return { ok: false, message: "لا يمكنك حذف حسابك الحالي." };
  if (!adminPassword) return { ok: false, message: "يرجى إدخال كلمة مرور الأدمن للتأكيد" };

  const verify = await verifyAdminPasswordAction({ get: () => adminPassword } as unknown as FormData);
  if (!verify.ok) return { ok: false, message: verify.message ?? "كلمة مرور الأدمن غير صحيحة" };

  const admin = createSupabaseAdminClient();

  await Promise.all([
    admin.from("class_students").delete().eq("student_id", userId.data),
    admin.from("class_teachers").delete().eq("teacher_id", userId.data),
    admin.from("grades").delete().eq("graded_by", userId.data),
    admin.from("assignment_attachments").delete().eq("uploaded_by", userId.data),
    admin.from("assignments").delete().or(`teacher_id.eq.${userId.data},created_by.eq.${userId.data}`),
    admin.from("classes").delete().eq("created_by", userId.data)
  ]);
  await admin.from("profiles").delete().eq("id", userId.data);

  const { error } = await admin.auth.admin.deleteUser(userId.data);
  if (error) return { ok: false, message: "تعذر حذف الحساب، حاول مجددًا." };

  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { ok: true, message: "تم حذف الحساب بنجاح." };
}

export async function bulkDeleteAccountsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const rawIds = formData.getAll("userIds");
  const userIds = rawIds
    .map((id) => uuidSchema.safeParse(id))
    .filter((r) => r.success)
    .map((r) => r.data);

  const adminPassword = String(formData.get("adminPassword") ?? "");

  if (userIds.length === 0) return { ok: false, message: "لم يتم تحديد حسابات." };
  if (!adminPassword) return { ok: false, message: "يرجى إدخال كلمة مرور الأدمن للتأكيد" };

  const verify = await verifyAdminPasswordAction({ get: () => adminPassword } as unknown as FormData);
  if (!verify.ok) return { ok: false, message: verify.message ?? "كلمة مرور الأدمن غير صحيحة" };

  const admin = createSupabaseAdminClient();

  if (userIds.includes(profile.id)) {
    return { ok: false, message: "لا يمكنك حذف حسابك الحالي." };
  }

  for (const userId of userIds) {
    await Promise.all([
      admin.from("class_students").delete().eq("student_id", userId),
      admin.from("class_teachers").delete().eq("teacher_id", userId),
      admin.from("grades").delete().eq("graded_by", userId),
      admin.from("assignment_attachments").delete().eq("uploaded_by", userId),
      admin.from("assignments").delete().or(`teacher_id.eq.${userId},created_by.eq.${userId}`),
      admin.from("classes").delete().eq("created_by", userId)
    ]);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }

  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { ok: true, message: `تم حذف ${userIds.length} حساب بنجاح.` };
}

export async function deleteClassAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const classId = uuidSchema.safeParse(formData.get("classId"));
  if (!classId.success) return { ok: false, message: "معرف الصف غير صالح." };

  const admin = createSupabaseAdminClient();

  try {
    const { data: assignments } = await admin
      .from("assignments")
      .select("id")
      .eq("class_id", classId.data);

    if (assignments && assignments.length > 0) {
      const assignmentIds = assignments.map((a) => a.id);

      const { data: attachments } = await admin
        .from("assignment_attachments")
        .select("storage_path")
        .in("assignment_id", assignmentIds);

      const { data: submissions } = await admin
        .from("submissions")
        .select("video_path")
        .in("assignment_id", assignmentIds);

      const { data: conversations } = await admin
        .from("conversations")
        .select("id")
        .in("assignment_id", assignmentIds);

      const convIds = conversations?.map(c => c.id) ?? [];
      const { data: messages } = await admin
        .from("messages")
        .select("storage_path")
        .in("conversation_id", convIds);

      const allPaths: Record<string, string[]> = {
        "assignment-attachments": (attachments ?? []).map((a) => a.storage_path).filter(Boolean),
        "submissions": (submissions ?? []).map((s) => s.video_path).filter(Boolean),
        "message-media": (messages ?? []).map((m) => m.storage_path).filter(Boolean),
      };

      for (const [bucket, paths] of Object.entries(allPaths)) {
        if (paths.length > 0) {
          await admin.storage.from(bucket).remove(paths);
        }
      }
    }

    const { error } = await admin.from("classes").delete().eq("id", classId.data);
    if (error) throw error;

    invalidateAdminCaches(profile.id);
    revalidatePath("/admin");
    revalidatePath("/admin/classes");
    return { ok: true, message: "تم حذف الصف وكافة البيانات المرتبطة به بنجاح." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "تعذر حذف الصف." };
  }
}

// ---------------------------------------------------------------------------
// Student class transfers (admin-only)
//
// Same year (equal non-empty grade_label) → only the class_students link is
// swapped, so the old conversations/submissions/grades stay as history.
// Cross-year (both labels set and different) → the student's conversations on
// the old class are deleted as well (grades reset for the new year). Media
// files are removed from storage BEFORE the rows so no orphans are left.
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Deletes a student's conversations on the given classes, media files first. */
async function purgeStudentClassConversations(admin: AdminClient, studentId: string, classIds: string[]) {
  if (classIds.length === 0) return 0;

  const { data: assignments } = await admin.from("assignments").select("id").in("class_id", classIds);
  const assignmentIds = (assignments ?? []).map((a) => String(a.id)).filter(Boolean);
  if (assignmentIds.length === 0) return 0;

  const { data: conversations } = await admin
    .from("conversations")
    .select("id")
    .eq("student_id", studentId)
    .in("assignment_id", assignmentIds);
  const conversationIds = (conversations ?? []).map((c) => String(c.id)).filter(Boolean);
  if (conversationIds.length === 0) return 0;

  const { data: submissions } = await admin
    .from("submissions")
    .select("id, video_path, voice_path")
    .in("conversation_id", conversationIds);
  const submissionIds = (submissions ?? []).map((s) => String(s.id)).filter(Boolean);

  const [{ data: images }, { data: messages }] = await Promise.all([
    submissionIds.length
      ? admin.from("submission_images").select("storage_path").in("submission_id", submissionIds)
      : Promise.resolve({ data: [] as { storage_path: string }[] }),
    admin.from("messages").select("storage_path").in("conversation_id", conversationIds)
  ]);

  const buckets: Array<[string, string[]]> = [
    [
      "submissions",
      [
        ...(submissions ?? []).map((s) => String(s.video_path)).filter(Boolean),
        ...(submissions ?? []).map((s) => String(s.voice_path)).filter(Boolean),
        ...(images ?? []).map((i) => String(i.storage_path)).filter(Boolean)
      ]
    ],
    ["message-media", (messages ?? []).map((m) => String(m.storage_path)).filter(Boolean)]
  ];

  for (const [bucket, paths] of buckets) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (chunk.length) await admin.storage.from(bucket).remove(chunk).catch(() => {});
    }
  }

  const { error } = await admin.from("conversations").delete().in("id", conversationIds);
  if (error) throw new Error(error.message);
  return conversationIds.length;
}

/**
 * Moves one student out of `sourceClassIds` (or out of every class when not
 * given) and into `target`. Returns whether anything changed and how many
 * conversations were purged for a cross-year move.
 */
async function transferStudent(
  admin: AdminClient,
  studentId: string,
  target: TransferClass,
  sourceClassIds?: string[]
): Promise<{ moved: boolean; purgedConversations: number; message?: string }> {
  const { data: linkRows, error: linkError } = await admin
    .from("class_students")
    .select("class_id")
    .eq("student_id", studentId);
  if (linkError) throw new Error(linkError.message);

  const currentClassIds = (linkRows ?? []).map((l) => String(l.class_id));
  const requested = sourceClassIds?.length ? sourceClassIds : currentClassIds;
  const classIdsToRemove = requested.filter((id) => id !== target.id && currentClassIds.includes(id));

  if (classIdsToRemove.length === 0 && currentClassIds.includes(target.id)) {
    return { moved: false, purgedConversations: 0, message: "الطالب موجود في الصف الجديد بالفعل." };
  }

  if (classIdsToRemove.length > 0) {
    const { error } = await admin
      .from("class_students")
      .delete()
      .eq("student_id", studentId)
      .in("class_id", classIdsToRemove);
    if (error) throw new Error(error.message);
  }

  const { error: linkErr } = await admin
    .from("class_students")
    .upsert({ class_id: target.id, student_id: studentId });
  if (linkErr) throw new Error(linkErr.message);

  let purgedConversations = 0;
  if (classIdsToRemove.length > 0) {
    const { data: classRows } = await admin
      .from("classes")
      .select("id, grade_label")
      .in("id", classIdsToRemove);
    const labelById = new Map(
      ((classRows ?? []) as Array<{ id: string; grade_label: string | null }>).map((c) => [
        String(c.id),
        String(c.grade_label ?? "")
      ])
    );
    const crossYearClassIds = classIdsToRemove.filter((classId) =>
      isCrossYearTransfer(labelById.get(classId), target.gradeLabel)
    );
    if (crossYearClassIds.length > 0) {
      purgedConversations = await purgeStudentClassConversations(admin, studentId, crossYearClassIds);
    }
  }

  return { moved: true, purgedConversations };
}

export async function transferStudentsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);

  const targetClassId = uuidSchema.safeParse(formData.get("targetClassId"));
  if (!targetClassId.success) return { ok: false, message: "اختر الصف الجديد أولًا." };

  const studentIds = formData
    .getAll("studentIds")
    .map((id) => uuidSchema.safeParse(id))
    .filter((r) => r.success)
    .map((r) => r.data);
  if (studentIds.length === 0) return { ok: false, message: "لم يتم تحديد أي طالب." };

  const admin = createSupabaseAdminClient();

  const { data: targetClass, error: targetError } = await admin
    .from("classes")
    .select("id, name, grade_label")
    .eq("id", targetClassId.data)
    .single();
  if (targetError || !targetClass) return { ok: false, message: "الصف الجديد غير موجود." };

  const target: TransferClass = {
    id: String(targetClass.id),
    name: String(targetClass.name ?? ""),
    gradeLabel: String(targetClass.grade_label ?? "")
  };

  // Only real student accounts can be transferred.
  const { data: profiles } = await admin.from("profiles").select("id, role").in("id", studentIds);
  const studentIdSet = new Set(
    ((profiles ?? []).filter((p) => p.role === "student") as Array<{ id: string }>).map((p) => String(p.id))
  );

  let moved = 0;
  let resetStudents = 0;
  let purgedConversations = 0;
  let skipped = 0;
  let failed = 0;

  for (const studentId of studentIds) {
    if (!studentIdSet.has(studentId)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await transferStudent(admin, studentId, target);
      if (result.moved) {
        moved += 1;
        if (result.purgedConversations > 0) {
          resetStudents += 1;
          purgedConversations += result.purgedConversations;
        }
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  if (moved === 0) {
    return {
      ok: false,
      message:
        failed > 0
          ? "تعذر نقل بعض الطلاب، حاول مجددًا."
          : "لم يتم نقل أي طالب (موجودون في الصف الجديد بالفعل أو حسابات غير طلاب)."
    };
  }

  invalidateAdminCaches(profile.id);
  invalidateAssignmentCaches(null, Array.from(studentIdSet));
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/transfer");

  const resetNote =
    resetStudents > 0 ? ` مسح سجل ${purgedConversations} محادثة لـ ${resetStudents} طالب بين سنتين مختلفتين.` : "";
  const skipNote = skipped > 0 ? ` تم تجاوز ${skipped}.` : "";
  const failNote = failed > 0 ? ` فشل ${failed}.` : "";
  return {
    ok: true,
    message: `تم نقل ${moved} طالب إلى «${target.name}».${resetNote}${skipNote}${failNote}`
  };
}

export async function importTransfersAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "اختر ملف إكسل أولًا." };
  if (file.size > MAX_TRANSFER_FILE_BYTES) return { ok: false, message: "حجم الملف أكبر من ٥ ميجابايت." };
  const fileName = String(file.name ?? "").toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    return { ok: false, message: "صيغة الملف غير مدعومة (.xlsx أو .xls فقط)." };
  }

  const parsed = await parseTransferFile(await file.arrayBuffer());
  if (parsed.fileError) return { ok: false, message: parsed.fileError };
  if (parsed.headerError) return { ok: false, message: parsed.headerError };
  if (parsed.rows.length === 0) return { ok: false, message: "لم يتم العثور على أي صفوف بيانات في أول ورقة." };

  const admin = createSupabaseAdminClient();

  const [{ data: studentsRes }, { data: classesRes }, { data: linksRes }] = await Promise.all([
    admin.from("profiles").select("id, code, full_name, role").eq("role", "student"),
    admin.from("classes").select("id, name, grade_label"),
    admin.from("class_students").select("class_id, student_id")
  ]);

  const classes: TransferClass[] = (
    (classesRes ?? []) as Array<{ id: string; name: string; grade_label: string | null }>
  ).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ""),
    gradeLabel: String(c.grade_label ?? "")
  }));

  const { valid, issues } = validateTransferRows(parsed.rows, {
    students: ((studentsRes ?? []) as Array<{ id: string; code: string; full_name: string }>).map((s) => ({
      id: String(s.id),
      code: String(s.code ?? ""),
      name: String(s.full_name ?? "")
    })),
    classes,
    links: ((linksRes ?? []) as Array<{ class_id: string; student_id: string }>).map((l) => ({
      classId: String(l.class_id),
      studentId: String(l.student_id)
    }))
  });

  const reported: Array<{ row: number; column: string; message: string }> = [...issues];
  let transferred = 0;
  let resetStudents = 0;
  let purgedConversations = 0;

  for (const row of valid) {
    const target = classes.find((c) => c.id === row.toClassId);
    if (!target) continue;
    try {
      const result = await transferStudent(admin, row.studentId, target, [row.fromClassId]);
      if (!result.moved) {
        reported.push({ row: row.row, column: "new class", message: result.message ?? "لم يتم النقل." });
        continue;
      }
      transferred += 1;
      if (result.purgedConversations > 0) {
        resetStudents += 1;
        purgedConversations += result.purgedConversations;
      }
    } catch (e) {
      reported.push({ row: row.row, column: "file", message: e instanceof Error ? e.message : "تعذر النقل." });
    }
  }

  invalidateAdminCaches(profile.id);
  invalidateAssignmentCaches(null, valid.map((r) => r.studentId));
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/transfer");

  const rejected = reported.length;
  const summary = `تم نقل ${transferred} من أصل ${parsed.rows.length} طالب.`;
  const resetNote =
    resetStudents > 0 ? ` مسح سجل ${purgedConversations} محادثة لـ ${resetStudents} طالب بين سنتين مختلفتين.` : "";
  return {
    ok: transferred > 0,
    message: (rejected > 0 ? `${summary} مرفوض: ${rejected}.` : summary) + resetNote,
    created: transferred,
    rejected,
    issues: reported
  };
}

export async function updateClassAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole(["admin"]);
  const classId = uuidSchema.safeParse(formData.get("classId"));
  const parsed = classSchema.safeParse({
    name: formData.get("name"),
    gradeLabel: formData.get("gradeLabel")
  });

  if (!classId.success) return { ok: false, message: "معرف الصف غير صالح." };
  if (!parsed.success) return { ok: false, message: "تحقق من بيانات الصف (الاسم والسنة/المرحلة مطلوبان)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("classes")
    .update({ name: parsed.data.name, grade_label: parsed.data.gradeLabel })
    .eq("id", classId.data);

  if (error) return { ok: false, message: error.message };
  invalidateAdminCaches(profile.id);
  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  return { ok: true, message: `تم تحديث بيانات «${parsed.data.name}».` };
}

function invalidateAssignmentCaches(teacherId: string | null, studentIds: string[]) {
  if (teacherId) {
    updateTag(`teacher-dashboard:${teacherId}`);
    updateTag(`conversations:${teacherId}`);
    updateTag(`assignments:${teacherId}`);
    updateTag(`statistics:${teacherId}`);
    updateTag(`teacher-classes:${teacherId}`);
  }
  for (const studentId of studentIds) {
    updateTag(`student-dashboard:${studentId}`);
    updateTag(`conversations:${studentId}`);
    updateTag(`teacher-dashboard:${studentId}`);
  }
  revalidatePath("/admin");
  revalidatePath("/teacher");
  revalidatePath("/student", "layout");
  revalidatePath("/notifications");
}

/**
 * Admin-only: find a published assignment by its title, then delete it together
 * with ALL its conversations, messages, submissions, grades and stored media
 * files. Uses the service-role client so the draft-only delete RLS policy does
 * not block it; the DB `on delete cascade` removes the conversation tree.
 */
export async function deleteAssignmentByTitleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);

  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const confirmed = formData.get("confirm") === "true";
  const title = String(formData.get("title") ?? "").trim();

  if (!assignmentId && !title) {
    return { ok: false, message: "اكتب جزءًا من اسم الواجب." };
  }

  const admin = createSupabaseAdminClient();

  if (assignmentId) {
    if (!confirmed) return { ok: false, message: "لم يُؤكد الحذف. أعد المحاولة." };

    const { data: assignment } = await admin
      .from("assignments")
      .select("id, title, teacher_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!assignment) return { ok: false, message: "الواجب غير موجود أو حُذف بالفعل." };

    const { data: convs } = await admin
      .from("conversations")
      .select("id, student_id")
      .eq("assignment_id", assignmentId);
    const convIds = (convs ?? []).map((c) => String(c.id));
    const studentIds = (convs ?? []).map((c) => String(c.student_id));

    const [{ data: attachments }, { data: submissions }, { data: messages }] = await Promise.all([
      admin.from("assignment_attachments").select("storage_path").eq("assignment_id", assignmentId),
      admin.from("submissions").select("id, video_path, voice_path").eq("assignment_id", assignmentId),
      convIds.length
        ? admin.from("messages").select("storage_path").in("conversation_id", convIds)
        : Promise.resolve({ data: [] })
    ]);

    let submissionImagePaths: string[] = [];
    const submissionIds = (submissions ?? []).map((s) => String(s.id)).filter(Boolean);
    if (submissionIds.length) {
      const { data: subImages } = await admin
        .from("submission_images")
        .select("storage_path")
        .in("submission_id", submissionIds);
      submissionImagePaths = (subImages ?? []).map((i) => String(i.storage_path)).filter(Boolean);
    }

    const submissionPaths = [
      ...(submissions ?? []).map((s) => String(s.video_path)).filter(Boolean),
      ...(submissions ?? []).map((s) => String(s.voice_path)).filter(Boolean),
      ...submissionImagePaths
    ];

    const buckets: Array<[string, string[]]> = [
      ["assignment-attachments", (attachments ?? []).map((a) => String(a.storage_path)).filter(Boolean)],
      ["submissions", submissionPaths],
      ["message-media", (messages ?? []).map((m) => String(m.storage_path)).filter(Boolean)]
    ];

    for (const [bucket, paths] of buckets) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        if (chunk.length) await admin.storage.from(bucket).remove(chunk).catch(() => {});
      }
    }

    const { error } = await admin.from("assignments").delete().eq("id", assignmentId);
    if (error) return { ok: false, message: `تعذر حذف الواجب: ${error.message}` };

    invalidateAssignmentCaches(assignment.teacher_id as string | null, studentIds);
    return {
      ok: true,
      message: `حُذف الواجب «${assignment.title}» مع ${convIds.length} محادثة وكل الملفات المرتبطة به.`
    };
  }

  if (title.length < 2) {
    return { ok: false, message: "اكتب حرفين على الأقل للبحث." };
  }

  const { data, error } = await admin
    .from("assignments")
    .select(
      "id, title, due_at, classes(name), teacher:profiles!assignments_teacher_id_fkey(full_name), conversations(count)"
    )
    .eq("status", "published")
    .ilike("title", `%${title.slice(0, 120)}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { ok: false, message: error.message };

  const matches = (data ?? []).map((m): AssignmentMatch => ({
    id: String(m.id),
    title: String(m.title ?? ""),
    className: (m.classes as { name?: string } | null)?.name ?? "",
    teacherName: (m.teacher as { full_name?: string } | null)?.full_name ?? "",
    dueAt: m.due_at as string | null,
    conversationCount: (m.conversations as { count?: number }[] | null)?.[0]?.count ?? 0
  }));

  if (matches.length === 0) {
    return { ok: false, message: "لا يوجد واجب منشور بهذا الاسم." };
  }

  return {
    ok: true,
    message: `وُجد ${matches.length} وأجـب. اضغط «تأكيد الحذف» تحت الواجب الصحيح — لا يمكن التراجع.`,
    matches
  };
}