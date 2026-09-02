import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.INITIAL_SETUP_SECRET;
  const providedSecret = request.headers.get("x-setup-secret");
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const code = process.env.INITIAL_ADMIN_CODE;
  const fullName = process.env.INITIAL_ADMIN_FULL_NAME || "ادمن واجباتي";

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return Response.json({ error: "غير مصرح" }, { status: 401 });
  }

  if (!email || !password || password.length < 8 || !code) {
    return Response.json({ error: "إعدادات الادمن الأول غير مكتملة" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (countError) return Response.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return Response.json({ error: "تم إعداد النظام مسبقًا" }, { status: 409 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "admin" }
  });

  if (error || !data.user) {
    return Response.json({ error: error?.message ?? "تعذر إنشاء الادمن" }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    full_name: fullName,
    email,
    role: "admin",
    code,
    is_active: true,
    must_change_password: false
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}