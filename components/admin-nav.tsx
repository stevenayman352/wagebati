import { LayoutGrid, Users, GraduationCap, RefreshCw, Trash2, LifeBuoy, type LucideIcon } from "lucide-react";

/**
 * Single source for the admin menu. This array used to be copy-pasted into both
 * `AdminSidebar` and `AdminMobileMenu`, which meant adding an item meant editing
 * two files and the drawer could silently drift from the sidebar.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "الرئيسية", icon: LayoutGrid, exact: true },
  { href: "/admin/support", label: "الدعم", icon: LifeBuoy },
  { href: "/admin/accounts", label: "الحسابات", icon: Users },
  { href: "/admin/classes", label: "الصفوف", icon: GraduationCap },
  { href: "/admin/reset-password", label: "إعادة تعيين كلمة المرور", icon: RefreshCw },
  { href: "/admin/delete-assignment", label: "حذف واجب", icon: Trash2 }
];

export const SUPPORT_NAV_HREF = "/admin/support";

/**
 * Unread count for the support inbox. Renders only on the support item so a
 * second badge can be added later without touching every row.
 */
export function AdminNavBadge({ href, supportUnread }: { href: string; supportUnread: number }) {
  if (href !== SUPPORT_NAV_HREF || supportUnread <= 0) return null;
  return (
    <span
      className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.68rem] font-bold leading-none text-primary-foreground"
      aria-label={`${supportUnread} محادثات غير مقروءة`}
    >
      {supportUnread > 99 ? "99+" : supportUnread}
    </span>
  );
}
