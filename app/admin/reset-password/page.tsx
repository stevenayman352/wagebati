import { ActionForm } from "@/components/action-form";
import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, updateCodeAction } from "@/app/actions/admin";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheLife, cacheTag } from "next/cache";
import { RefreshCw, KeyRound } from "lucide-react";
import { UserCodeLookup } from "@/components/admin/UserCodeLookup";

type UserRow = { id: string; full_name: string; code: string; role: string };

async function loadAdminResetPassword(profileId: string) {
  "use cache: private";
  cacheTag(`accounts:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [{ count: unreadCount }, usersRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .eq("is_read", false),
    supabase
      .from("profiles")
      .select("id, full_name, code, role")
      .order("full_name")
  ]);

  return {
    unreadCount: unreadCount ?? 0,
    users: (usersRes.data ?? []) as unknown as UserRow[]
  };
}

export default async function AdminResetPasswordPage() {
  const profile = await requireRole(["admin"]);

  const data = await loadAdminResetPassword(profile.id);
  const userOptions = data.users;
  const studentOptions = userOptions.filter((u) => u.role === "student");

  return (
    <AdminLayout profile={profile} title="إعادة تعيين كلمة المرور" subtitle="إدارة كلمات المرور" unread={data.unreadCount}>
      <div className="mx-auto max-w-2xl">
        <AdminSection icon={RefreshCw} title="إعادة تعيين كلمة المرور" subtitle="سيُطلب من المستخدم تغييرها عند الدخول.">
          <ActionForm action={resetPasswordAction} className="grid gap-3.5" submitLabel="إعادة تعيين">
            <div className="grid gap-1.5">
              <Label htmlFor="resetUserCode">كود الحساب</Label>
              <UserCodeLookup users={userOptions} />
              <p className="text-xs text-muted-foreground">اكتب الكود وسيظهر اسم صاحبه في حقل قراءة فقط.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="resetPassword">كلمة مرور جديدة</Label>
              <PasswordInput id="resetPassword" name="password" required minLength={8} />
            </div>
          </ActionForm>
        </AdminSection>

        <AdminSection icon={KeyRound} title="تعديل كود الدخول" subtitle="يُطبَّق على الحسابات الدراسية فقط.">
          <ActionForm action={updateCodeAction} className="grid gap-3.5" submitLabel="حفظ الكود">
            <div className="grid gap-1.5">
              <Label htmlFor="studentUserCode">كود الطالب</Label>
              <UserCodeLookup users={studentOptions} />
              <p className="text-xs text-muted-foreground">اكتب الكود وسيظهر اسم الطالب في حقل قراءة فقط.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="newCode">الكود الجديد</Label>
              <Input
                id="newCode"
                name="code"
                required
                minLength={4}
                maxLength={24}
                dir="ltr"
                pattern="[a-z0-9]{4,24}"
                placeholder="e.g. abc123"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                ٤-٢٤ حرفًا أو رقمًا إنجليزيًا. بعد الحفظ يدخل الطالب بالكود الجديد. بياناته (الدرجات والمحادثات والصف) تبقى كما هي.
              </p>
            </div>
          </ActionForm>
        </AdminSection>
      </div>
    </AdminLayout>
  );
}
