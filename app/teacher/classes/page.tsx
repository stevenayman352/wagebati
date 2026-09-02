import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { NotificationBell } from "@/components/notification-bell";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Users, ChevronUp } from "lucide-react";

export default async function TeacherClassesPage() {
  const profile = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  const { data: myClasses } = await supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", profile.id);

  const classIds = profile.role === "admin"
    ? null
    : (myClasses ?? []).map((r) => r.class_id as string);

  let classesQuery = supabase.from("classes").select("id, name, grade_label").order("name");
  if (classIds) classesQuery = classesQuery.in("id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: classes } = await classesQuery;

  const { data: enrollRes } = await supabase.from("class_students").select("class_id, student_id");
  const studentCounts = new Map<string, number>();
  for (const e of enrollRes ?? []) {
    const cid = e.class_id as string;
    studentCounts.set(cid, (studentCounts.get(cid) ?? 0) + 1);
  }

  return (
    <>
      <PageShell wide>
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[var(--text-h1)] font-extrabold">الفصول</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">أختر الفصل للاطلاع على طلابه</p>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell userId={profile.id} initialUnread={unreadCount ?? 0} />
          </div>
        </header>

        <div className="grid gap-2.5">
          {(classes ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/teacher/classes/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card transition-all hover:shadow-raise"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="size-5 text-primary" />
                </span>
                <div>
                  <div className="text-base font-bold">فصل {c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.grade_label}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{studentCounts.get(c.id) ?? 0} طالب</Badge>
                <ChevronUp className="size-4 rotate-180 text-muted-foreground" />
              </div>
            </Link>
          ))}
          {(classes ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              لم تُربط بأي صف بعد. اطلب من الإدارة ربطك بصفوفك.
            </p>
          ) : null}
        </div>
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
