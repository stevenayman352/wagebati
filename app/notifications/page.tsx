import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { NotificationFeed, type NotificationRow } from "@/components/notification-feed";
import { PushEnabler } from "@/components/push-enabler";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/page-shell";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BellRing, ArrowUpRight } from "lucide-react";

export const metadata = { title: "الإشعارات" };

type NotificationRecord = NotificationRow & { id: string };

async function loadNotifications(userId: string) {
  "use cache: private";
  cacheTag(`notifications:${userId}`);
  cacheLife({ stale: 60 });

  const supabase = await createSupabaseServerClient();

  const [{ data: notifications }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, href, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false)
  ]);

  return {
    notifications: (notifications ?? []) as unknown as NotificationRecord[],
    unreadCount: count ?? 0
  };
}

export default async function NotificationsPage() {
  const profile = await requireRole(["admin", "teacher", "student"]);

  const data = await loadNotifications(profile.id);

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
                {data.unreadCount && data.unreadCount > 0 ? `لديك ${data.unreadCount} إشعار غير مقروء` : "كل شيء مقروء"}
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
        <NotificationFeed userId={profile.id} initial={data.notifications} initialUnread={data.unreadCount} />
      </PageShell>
      <AppNav role={navRole} />
    </>
  );
}
