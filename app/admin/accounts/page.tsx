import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AccountsFilter } from "@/components/accounts-filter";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheLife, cacheTag } from "next/cache";
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
  initial_password: string | null;
  created_at: string;
};

async function loadAdminAccounts(profileId: string) {
  "use cache: private";
  cacheTag(`accounts:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [{ count: unreadCount }, usersRes, classesRes, studentsRes, teachersRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .eq("is_read", false),
    supabase.from("profiles").select("id, full_name, email, code, role, is_active, must_change_password, initial_password, created_at").order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name"),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("class_teachers").select("class_id, teacher_id")
  ]);

  return {
    unreadCount: unreadCount ?? 0,
    users: (usersRes.data ?? []) as unknown as Row[],
    classNames: (classesRes.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    studentLinks: (studentsRes.data ?? []).map((s) => ({ classId: s.class_id as string, userId: s.student_id as string })),
    teacherLinks: (teachersRes.data ?? []).map((t) => ({ classId: t.class_id as string, userId: t.teacher_id as string }))
  };
}

export default async function AdminAccountsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireRole(["admin"]);

  const data = await loadAdminAccounts(profile.id);

  const classNames = new Map<string, string>(data.classNames.map((c) => [c.id, c.name]));
  const userClasses = new Map<string, string[]>();
  data.studentLinks.forEach((l) => {
    const name = classNames.get(l.classId);
    if (!name) return;
    const arr = userClasses.get(l.userId) ?? [];
    if (!arr.includes(name)) arr.push(name);
    userClasses.set(l.userId, arr);
  });
  data.teacherLinks.forEach((l) => {
    const name = classNames.get(l.classId);
    if (!name) return;
    const arr = userClasses.get(l.userId) ?? [];
    if (!arr.includes(name)) arr.push(name);
    userClasses.set(l.userId, arr);
  });

  const rows = data.users.map((u) => ({
    ...u,
    classes: userClasses.get(u.id) ?? []
  }));

  const errorText = params.error ? errorMessages[params.error] ?? null : null;

  return (
    <AdminLayout profile={profile} title="الحسابات" subtitle="إدارة الحسابات" unread={data.unreadCount}>
      <AdminSection icon={Users} title="الحسابات" subtitle="فعّل أو أوقف الحسابات، اعرض تفاصيلها، أو احذفها.">
        <AccountsFilter rows={rows} errorText={errorText} />
      </AdminSection>
    </AdminLayout>
  );
}
