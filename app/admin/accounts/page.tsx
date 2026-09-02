import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AccountsFilter } from "@/components/accounts-filter";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Users } from "lucide-react";

const errorMessages: Record<string, string> = {
  invalid: "طلب غير صالح.",
  self_delete: "لا يمكنك حذف حسابك الحالي.",
  delete_failed: "تعذر حذف الحساب، حاول مجددًا.",
  toggle_failed: "تعذر تحديث الحالة، حاول مجددًا."
};

type Row = {
  id: string;
  full_name: string;
  email: string;
  code: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export default async function AdminAccountsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const [usersRes, classesRes, studentsRes, teachersRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, code, role, is_active, must_change_password, created_at").order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name"),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("class_teachers").select("class_id, teacher_id")
  ]);

  const classNames = new Map<string, string>((classesRes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const userClasses = new Map<string, string[]>();
  (studentsRes.data ?? []).forEach((s) => {
    const name = classNames.get(s.class_id as string);
    if (!name) return;
    const arr = userClasses.get(s.student_id as string) ?? [];
    if (!arr.includes(name)) arr.push(name);
    userClasses.set(s.student_id as string, arr);
  });
  (teachersRes.data ?? []).forEach((t) => {
    const name = classNames.get(t.class_id as string);
    if (!name) return;
    const arr = userClasses.get(t.teacher_id as string) ?? [];
    if (!arr.includes(name)) arr.push(name);
    userClasses.set(t.teacher_id as string, arr);
  });

  const rows = ((usersRes.data ?? []) as unknown as Row[]).map((u) => ({
    ...u,
    classes: userClasses.get(u.id) ?? []
  }));

  const errorText = params.error ? errorMessages[params.error] ?? null : null;

  return (
    <AdminLayout profile={profile} title="الحسابات" subtitle="إدارة الحسابات" unread={unreadCount ?? 0}>
      <AdminSection icon={Users} title="الحسابات" subtitle="فعّل أو أوقف الحسابات، اعرض تفاصيلها، أو احذفها.">
        <AccountsFilter rows={rows} errorText={errorText} />
      </AdminSection>
    </AdminLayout>
  );
}
