import Link from "next/link";
import { NotificationFeed, type NotificationRow } from "@/components/notification-feed";
import { PushEnabler } from "@/components/push-enabler";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/page-shell";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BellRing, ArrowUpRight } from "lucide-react";

export const metadata = { title: "الإشعارات" };

export default async function NotificationsPage() {
  const profile = await requireRole(["admin", "teacher", "student"]);
  const supabase = await createSupabaseServerClient();

  const [{ data: notifications }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, href, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("is_read", false)
  ]);

  const home = profile.role === "admin" ? "/admin" : profile.role === "teacher" ? "/teacher" : "/student";
  const navRole = profile.role === "admin" ? "admin" : profile.role;

  return (
    <>
      <PageShell>
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/12">
              <BellRing className="size-5 text-primary" />
            </span>
            <div>
              <h1 className="text-[var(--text-h2)] font-extrabold">الإشعارات</h1>
              <p className="text-sm text-muted-foreground">
                {count && count > 0 ? `لديك ${count} إشعار غير مقروء` : "كل شيء مقروء"}
              </p>
            </div>
          </div>
          <Link
            href={home}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowUpRight className="size-4 rotate-90" />
            العودة
          </Link>
        </header>

        <PushEnabler />
        <NotificationFeed userId={profile.id} initial={(notifications ?? []) as NotificationRow[]} initialUnread={count ?? 0} />
      </PageShell>
      <AppNav role={navRole} />
    </>
  );
}
