"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Bell, UserRound, Users, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutGrid };

const ROLE_ITEMS: Record<string, NavItem[]> = {
  student: [
    { href: "/student", label: "الرئيسية", icon: LayoutGrid },
    { href: "/notifications", label: "الإشعارات", icon: Bell },
    { href: "/student?tab=account", label: "الحساب", icon: UserRound }
  ],
  teacher: [
    { href: "/teacher", label: "الرئيسية", icon: LayoutGrid },
    { href: "/teacher/classes", label: "الفصول", icon: Users },
    { href: "/teacher/assignments", label: "الواجبات", icon: ClipboardList },
    { href: "/notifications", label: "الإشعارات", icon: Bell },
    { href: "/teacher?tab=account", label: "الحساب", icon: UserRound }
  ]
};

function AppNavContent({ role }: { role: "student" | "teacher" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const items = ROLE_ITEMS[role] ?? [];

  const isActive = (item: NavItem) => {
    if (item.href.includes("tab=account")) return tab === "account";
    if (item.href === "/student" || item.href === "/teacher")
      return pathname === item.href && tab !== "account";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-safe"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around rounded-[26px] border border-border/70 bg-card/95 px-2 py-1.5 shadow-raise backdrop-blur-xl md:max-w-2xl">
        {items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1.5 transition-colors"
            >
              <span
                className={cn(
                  "relative flex h-9 w-14 items-center justify-center rounded-2xl transition-all duration-200",
                  active ? "bg-primary/[0.12]" : "group-hover:bg-muted"
                )}
              >
                <Icon
                  className={cn(
                    "size-[22px] transition-all duration-200",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span
                  className={cn(
                    "absolute -bottom-1 h-1 rounded-full bg-primary transition-all duration-200",
                    active ? "w-4 opacity-100" : "w-0 opacity-0"
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[0.68rem] font-semibold leading-none transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppNav({ role }: { role: "student" | "teacher" | "admin" }) {
  if (role === "admin") return null;
  return (
    <Suspense fallback={null}>
      <AppNavContent role={role} />
    </Suspense>
  );
}