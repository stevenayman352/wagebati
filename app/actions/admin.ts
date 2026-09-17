"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountSchema, classSchema, codeSchema, uuidSchema } from "@/lib/validators";
import { accountEmailForCode, generateAccountCode } from "@/lib/accounts";
import { MAX_IMPORT_FILE_BYTES, parseImportFile, validateImportRows } from "@/lib/import-accounts";
import type { ActionState, ImportIssue } from "@/lib/types";
import { verifyAdminPasswordAction } from "@/app/actions/auth";

function invalidateAdminCaches(adminId: string) {
  updateTag(`admin-home:${adminId}`);
  updateTag(`accounts:${adminId}`);
  updateTag(`classes:${adminId}`);
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