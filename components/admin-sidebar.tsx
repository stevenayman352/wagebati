"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { LayoutGrid, Users, GraduationCap, RefreshCw, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { signOutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/admin", label: "الرئيسية", icon: LayoutGrid, exact: true },
  { href: "/admin/accounts", label: "الحسابات", icon: Users },
  { href: "/admin/classes", label: "الصفوف", icon: GraduationCap },
  { href: "/admin/reset-password", label: "إعادة تعيين كلمة المرور", icon: RefreshCw }
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <aside className="hidden shrink-0 border-l border-border/70 bg-card md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col md:p-5">
      <div className="mb-8 flex items-center gap-2.5">
        <BrandLogo className="size-10 rounded-xl" />
        <div>
          <div className="font-extrabold leading-none">واجباتي</div>
          <div className="mt-0.5 text-xs text-muted-foreground">لوحة الإدارة</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/8 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 border-t border-border/60 pt-3">
        <form
          action={() => {
            startTransition(async () => {
              await signOutAction();
            });
          }}
        >
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {pending ? "جارِ الخروج..." : "خروج"}
          </button>
        </form>
      </div>
    </aside>
  );
}
