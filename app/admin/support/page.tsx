import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { AdminSection } from "@/components/admin-section";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
import { AdminSupportSearch } from "@/components/admin-support-search";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supportUnreadCounts, supportUnreadTotal } from "@/lib/support/reader";
import { loadSupportInbox } from "@/lib/support/queries";

export const metadata = { title: "الدعم" };

/**
 * Support inbox. Threads are never closed, so there is no status column and no
 * filter for one — the useful cuts are unread, and whether the requester is a
 * guest (no account yet) or a student.
 */
type Filter = "all" | "unread" | "guests" | "students";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروءة" },
  { key: "guests", label: "زوار" },
  { key: "students", label: "طلاب" }
];

function isFilter(value: string | undefined): value is Filter {
  return FILTERS.some((f) => f.key === value);
}

export default async function AdminSupportPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  const { filter, q } = await searchParams;
  const active: Filter = isFilter(filter) ? filter : "all";
  const query = (q ?? "").slice(0, 120);

  const [unreadCounts, supportUnread, notificationUnread] = await Promise.all([
    supportUnreadCounts(profile),
    supportUnreadTotal(profile),
    countNotificationUnread(profile.id)
  ]);

  const all = await loadSupportInbox(unreadCounts, query);
  const rows = all.filter((t) => {
    if (active === "unread") return t.unread > 0;
    if (active === "guests") return t.isGuest;
    if (active === "students") return !t.isGuest;
    return true;
  });

  // Filter chips have to carry the query along, or changing the filter would
  // silently drop an active search.
  const chipHref = (key: Filter) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("filter", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/support?${qs}` : "/admin/support";
  };

  return (
    <AdminLayout
      profile={profile}
      title="الدعم"
      subtitle="محادثات الزوار والطلاب"
      unread={notificationUnread}
      supportUnread={supportUnread}
    >
      <div className="grid min-w-0 gap-5">
        <AdminSupportSearch initial={query} />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={chipHref(f.key)}
              className={
                active === f.key
                  ? "rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary"
                  : "rounded-full border border-border/70 bg-muted/40 px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {f.label}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-10 text-center">
            <LifeBuoy className="mx-auto mb-3 size-10 text-primary/40" />
            <p className="font-semibold text-foreground">
              {query
                ? "مفيش نتايج للبحث"
                : active === "all"
                  ? "مفيش محادثات دعم لسه"
                  : "مفيش محادثات في هذا التصنيف"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query
                ? `مفيش محادثة باسم أو كود أو رسالة فيه «${query}».`
                : "أول ما حد يفتح محادثة من صفحة الدعم هتظهر هنا."}
            </p>
          </div>
        ) : (
          <AdminSection icon={LifeBuoy} title="المحادثات" subtitle={`${rows.length} محادثة`}>
            <AdminSupportInbox rows={rows} />
          </AdminSection>
        )}
      </div>
    </AdminLayout>
  );
}

async function countNotificationUnread(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return count ?? 0;
}
