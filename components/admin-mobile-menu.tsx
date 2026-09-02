"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Users, GraduationCap, RefreshCw, LogOut, Menu, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

const NAV = [
  { href: "/admin", label: "الرئيسية", icon: LayoutGrid, exact: true },
  { href: "/admin/accounts", label: "الحسابات", icon: Users },
  { href: "/admin/classes", label: "الصفوف", icon: GraduationCap },
  { href: "/admin/reset-password", label: "إعادة تعيين كلمة المرور", icon: RefreshCw }
];

export function AdminMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = open ? (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className="absolute inset-y-0 right-0 z-10 flex w-[80%] max-w-xs flex-col border-l border-border/70 bg-card shadow-raise animate-in slide-in-from-right duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="قائمة الإدارة"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="size-9 rounded-xl" />
            <div>
              <div className="text-sm font-extrabold leading-none">الإدارة</div>
              <div className="mt-0.5 text-xs text-muted-foreground">واجباتي</div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/8 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 p-3">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4" />
              خروج
            </button>
          </form>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <div className="relative">
        <Button type="button" variant="ghost" size="icon" aria-label="القائمة" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </Button>
      </div>
      {typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
    </>
  );
}
