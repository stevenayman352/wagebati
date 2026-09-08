import { ActionForm } from "@/components/action-form";
import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, updateCodeAction } from "@/app/actions/admin";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RefreshCw, KeyRound } from "lucide-react";
import { UserCodeLookup } from "@/components/admin/UserCodeLookup";

type UserRow = { id: string; full_name: string; code: string; role: string };

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
  const studentOptions = userOptions.filter((u) => u.role === "student");

  return (
    <AdminLayout profile={profile} title="إعادة تعيين كلمة المرور" subtitle="إدارة كلمات المرور" unread={unreadCount ?? 0}>
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
