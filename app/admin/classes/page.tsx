import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { ClassForm } from "@/components/class-form";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cacheLife, cacheTag } from "next/cache";
import { GraduationCap } from "lucide-react";
import { ClassRow } from "@/components/admin/ClassRow";

type ClassRowData = { id: string; name: string; grade_label: string | null };

async function loadAdminClasses(profileId: string) {
  "use cache: private";
  cacheTag(`classes:${profileId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [{ count: unreadCount }, classesRes, studentsRes, teachersRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profileId)
      .eq("is_read", false),
    supabase.from("classes").select("id, name, grade_label").order("created_at", { ascending: false }),
    supabase.from("class_students").select("class_id"),
    supabase.from("class_teachers").select("class_id")
  ]);

  return {
    unreadCount: unreadCount ?? 0,
    classes: (classesRes.data ?? []) as unknown as ClassRowData[],
    studentClassIds: (studentsRes.data ?? []).map((s) => s.class_id as string),
    teacherClassIds: (teachersRes.data ?? []).map((t) => t.class_id as string)
  };
}

export default async function AdminClassesPage() {
  const profile = await requireRole(["admin"]);

  const data = await loadAdminClasses(profile.id);
  const classes = data.classes;
  const counts = new Map<string, { students: number; teachers: number }>();
  data.studentClassIds.forEach((classId) => {
    const c = counts.get(classId) ?? { students: 0, teachers: 0 };
    c.students += 1;
    counts.set(classId, c);
  });
  data.teacherClassIds.forEach((classId) => {
    const c = counts.get(classId) ?? { students: 0, teachers: 0 };
    c.teachers += 1;
    counts.set(classId, c);
  });

  return (
    <AdminLayout profile={profile} title="الصفوف" subtitle="إدارة الصفوف" unread={data.unreadCount}>
      <AdminSection icon={GraduationCap} title="الصفوف" subtitle="بيانات الصفوف وأعداد الطلاب والمُدرّسين للتصدير.">
        <div className="mb-4 flex justify-end">
          <ClassForm />
        </div>
        {classes.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد صفوف بعد.</p> : null}
        <div className="grid gap-2.5">
          {classes.map((c) => {
            const ccounts = counts.get(c.id) ?? { students: 0, teachers: 0 };
            return (
              <ClassRow
                key={c.id}
                id={c.id}
                name={c.name}
                gradeLabel={c.grade_label}
                students={ccounts.students}
                teachers={ccounts.teachers}
              />
            );
          })}
        </div>
      </AdminSection>
    </AdminLayout>
  );
}
