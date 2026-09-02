import { ActionForm } from "@/components/action-form";
import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AccountClassSelector } from "@/components/account-class-selector";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { createAccountAction, createClassAction, importAccountsAction } from "@/app/actions/admin";
import { ImportAccountsForm } from "@/components/import-accounts-form";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UserPlus, FolderKanban, FileSpreadsheet } from "lucide-react";

export default async function AdminHomePage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const { data: classesRes } = await supabase
    .from("classes")
    .select("id, name, grade_label")
    .order("created_at", { ascending: false });

  const classes = (classesRes ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));

  return (
    <AdminLayout
      profile={profile}
      title={profile.full_name?.trim().split(/\s+/).slice(0, 2).join(" ") ? `أهلًا ${profile.full_name.trim().split(/\s+/).slice(0, 2).join(" ")}` : "لوحة الإدارة"}
      subtitle="الرئيسية"
      unread={unreadCount ?? 0}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <AdminSection icon={UserPlus} title="حساب جديد" subtitle="أنشئ حسابًا واربطه بصفه مباشرة.">
          <ActionForm action={createAccountAction} className="grid gap-3.5" submitLabel="إنشاء الحساب">
            <div className="grid gap-1.5">
              <Label htmlFor="fullName">الاسم الكامل</Label>
              <Input id="fullName" name="fullName" required />
            </div>

            <AccountClassSelector classes={classes} />

            <div className="grid gap-1.5">
              <Label htmlFor="code">كود الدخول</Label>
              <Input id="code" name="code" placeholder="تلقائي" dir="ltr" className="text-center" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">كلمة المرور الأولية</Label>
              <PasswordInput id="password" name="password" required minLength={8} />
            </div>
          </ActionForm>
        </AdminSection>

        <AdminSection icon={FolderKanban} title="صف جديد" subtitle="أضف صفًا جديدًا لتنظيم الطلاب.">
          <ActionForm action={createClassAction} className="grid gap-3.5" submitLabel="إنشاء الصف">
            <div className="grid gap-1.5">
              <Label htmlFor="name">اسم الصف</Label>
              <Input id="name" name="name" required />
            </div>
          </ActionForm>
        </AdminSection>

        <div className="lg:col-span-2">
          <AdminSection
            icon={FileSpreadsheet}
            title="استيراد حسابات (إكسل)"
            subtitle="حمّل القالب، املأ بيانات الحسابات، ثم ارفع الملف. انسخ الصفوف من ورقة «الصفوف» لتجنب الأخطاء."
          >
            <ImportAccountsForm action={importAccountsAction} />
          </AdminSection>
        </div>
      </div>
    </AdminLayout>
  );
}
