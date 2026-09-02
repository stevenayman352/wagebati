import { ActionForm } from "@/components/action-form";
import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/app/actions/admin";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RefreshCw } from "lucide-react";

function roleLabel(role: string) {
  return role === "admin" ? "ادمن" : role === "teacher" ? "مُدرّس" : "طالب";
}

type UserRow = { id: string; full_name: string; code: string; role: string };

const selectCls = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

export default async function AdminResetPasswordPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const { data: usersRes } = await supabase
    .from("profiles")
    .select("id, full_name, code, role")
    .order("full_name");

  const userOptions = (usersRes ?? []) as unknown as UserRow[];

  return (
    <AdminLayout profile={profile} title="إعادة تعيين كلمة المرور" subtitle="إدارة كلمات المرور" unread={unreadCount ?? 0}>
      <div className="mx-auto max-w-2xl">
        <AdminSection icon={RefreshCw} title="إعادة تعيين كلمة المرور" subtitle="سيُطلب من المستخدم تغييرها عند الدخول.">
          <ActionForm action={resetPasswordAction} className="grid gap-3.5" submitLabel="إعادة تعيين">
            <div className="grid gap-1.5">
              <Label htmlFor="resetUserId">الحساب</Label>
              <select id="resetUserId" name="userId" className={selectCls} required>
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.code}) - {roleLabel(u.role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="resetPassword">كلمة مرور جديدة</Label>
              <PasswordInput id="resetPassword" name="password" required minLength={8} />
            </div>
          </ActionForm>
        </AdminSection>
      </div>
    </AdminLayout>
  );
}
