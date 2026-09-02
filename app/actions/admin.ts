"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountSchema, classSchema, uuidSchema } from "@/lib/validators";
import { accountEmailForCode, generateAccountCode } from "@/lib/accounts";
import { MAX_IMPORT_FILE_BYTES, parseImportFile, validateImportRows } from "@/lib/import-accounts";
import type { ActionState, ImportIssue } from "@/lib/types";

export async function createAccountAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
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
    must_change_password: true
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

revalidatePath("/admin");
  return { ok: true, message: `تم إنشاء الحساب، كود الدخول: ${available.code}` };
}

export async function importAccountsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);

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
      must_change_password: true
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
  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  return { ok: true, message: "تم إنشاء الصف." };
}

export async function assignUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
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
  revalidatePath("/admin");
  return { ok: true, message: "تم ربط المستخدم بالصف." };
}

export async function unassignUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
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
  revalidatePath("/admin");
  return { ok: true, message: "تم فك الربط." };
}

export async function toggleActiveAction(formData: FormData) {
  await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));
  const targetActive = formData.get("active") === "true";

  if (!userId.success) redirect("/admin?error=invalid");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: targetActive }).eq("id", userId.data);
  if (error) redirect("/admin/accounts?error=toggle_failed");
  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
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

  revalidatePath("/admin");
  return { ok: true, message: "تمت إعادة تعيين كلمة المرور وسيُطلب تغييرها عند الدخول." };
}

export async function deleteAccountAction(formData: FormData) {
  const profile = await requireRole(["admin"]);
  const userId = uuidSchema.safeParse(formData.get("userId"));

  if (!userId.success) redirect("/admin/accounts?error=invalid");
  if (profile.id === userId.data) redirect("/admin/accounts?error=self_delete");

  const admin = createSupabaseAdminClient();

  await admin.from("class_students").delete().eq("student_id", userId.data);
  await admin.from("class_teachers").delete().eq("teacher_id", userId.data);
  await admin.from("profiles").delete().eq("id", userId.data);

  const { error } = await admin.auth.admin.deleteUser(userId.data);
  if (error) redirect("/admin/accounts?error=delete_failed");

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}