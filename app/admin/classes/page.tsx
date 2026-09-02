import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { ClassForm } from "@/components/class-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GraduationCap, Download } from "lucide-react";

type ClassRow = { id: string; name: string; grade_label: string | null };

export default async function AdminClassesPage() {
  const profile = await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const [classesRes, studentsRes, teachersRes] = await Promise.all([
    supabase.from("classes").select("id, name, grade_label").order("created_at", { ascending: false }),
    supabase.from("class_students").select("class_id"),
    supabase.from("class_teachers").select("class_id")
  ]);

  const classes = (classesRes.data ?? []) as unknown as ClassRow[];
  const counts = new Map<string, { students: number; teachers: number }>();
  (studentsRes.data ?? []).forEach((s) => {
    const c = counts.get(s.class_id) ?? { students: 0, teachers: 0 };
    c.students += 1;
    counts.set(s.class_id, c);
  });
  (teachersRes.data ?? []).forEach((t) => {
    const c = counts.get(t.class_id) ?? { students: 0, teachers: 0 };
    c.teachers += 1;
    counts.set(t.class_id, c);
  });

  return (
    <AdminLayout profile={profile} title="الصفوف" subtitle="إدارة الصفوف" unread={unreadCount ?? 0}>
      <AdminSection icon={GraduationCap} title="الصفوف" subtitle="بيانات الصفوف وأعداد الطلاب والمُدرّسين للتصدير.">
        <div className="mb-4 flex justify-end">
          <ClassForm />
        </div>
        {classes.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد صفوف بعد.</p> : null}
        <div className="grid gap-2.5">
          {classes.map((c) => {
            const ccounts = counts.get(c.id) ?? { students: 0, teachers: 0 };
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    {c.grade_label ? <Badge variant="secondary">{c.grade_label}</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ccounts.students} طلاب · {ccounts.teachers} مُدرّسون
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/export?target=class&format=xlsx&id=${c.id}`} className="gap-1">
                      <Download className="size-3.5" /> إكسل
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/export?target=class&format=pdf&id=${c.id}`}>PDF</a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </AdminSection>
    </AdminLayout>
  );
}
