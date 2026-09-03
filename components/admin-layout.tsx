import type { ReactNode } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminMobileMenu } from "@/components/admin-mobile-menu";
import type { Profile } from "@/lib/types";

/**
 * Shared admin shell: vertical sidebar (desktop) + sticky top bar with a
 * mobile "menu" hamburger linking to each section page.
 */
export function AdminLayout({
  profile,
  title,
  subtitle,
  unread,
  children
}: {
  profile: Profile;
  title: string;
  subtitle: string;
  unread: number;
  children: ReactNode;
}) {
  return (
    <div dir="rtl" className="min-h-dvh md:flex">
      <AdminSidebar />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex items-center gap-2.5">
              <AdminMobileMenu />
              <div>
                <h1 className="font-amiri text-2xl font-bold">{title}</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">{subtitle} · {profile.full_name}</p>
              </div>
            </div>
            <NotificationBell userId={profile.id} initialUnread={unread} />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
