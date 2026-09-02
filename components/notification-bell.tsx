"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  grade: "درجة",
  revision: "مراجعة",
  closed: "إغلاق",
  submission: "حل جديد",
  message: "رسالة"
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  return `${Math.floor(h / 24)} ي`;
}

export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef(createSupabaseBrowserClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          setUnread((prev) => prev + 1);
          setItems((prev) => [n, ...prev].slice(0, 10));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const openPanel = useCallback(async () => {
    setOpen((v) => !v);
    if (!open && items.length === 0) {
      setLoading(true);
      const { data } = await supabaseRef.current
        .from("notifications")
        .select("id, type, title, body, href, is_read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      setItems((data ?? []) as NotificationRow[]);
      setLoading(false);
    }
  }, [open, items.length, userId]);

  function markOne(n: NotificationRow) {
    void markNotificationReadAction(notificationIdForm(n.id));
    setUnread((prev) => Math.max(0, prev - (n.is_read ? 0 : 1)));
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
  }

  function markAll() {
    const fd = new FormData();
    void markAllNotificationsReadAction({ ok: false, message: "" }, fd);
    setUnread(0);
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="icon" className="relative text-muted-foreground hover:text-primary" onClick={() => void openPanel()} aria-label="الإشعارات">
        <Bell className="size-5" />
        {unread > 0 ? (
          <Badge className="absolute -left-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px]" variant="destructive">
            {unread > 99 ? "99+" : unread}
          </Badge>
        ) : null}
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-border/70 bg-card shadow-raise">
            <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
              <span className="text-sm font-semibold">الإشعارات</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={markAll} disabled={unread === 0}>
                  تحديد الكل مقروءًا
                </Button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? <p className="p-3 text-sm text-muted-foreground">جار التحميل...</p> : null}
              {!loading && items.length === 0 ? <p className="p-3 text-sm text-muted-foreground">لا توجد إشعارات.</p> : null}
              {items.map((n) => {
                const inner = (
                  <div className={`flex gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted ${n.is_read ? "" : "bg-primary/5"}`}>
                    <Badge variant={n.is_read ? "outline" : "default"}>{TYPE_LABEL[n.type] ?? n.type}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.body} · {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {n.is_read ? null : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
                  </div>
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => markOne(n)}>
                    {inner}
                  </Link>
                ) : (
                  <button key={n.id} type="button" className="block w-full text-right" onClick={() => markOne(n)}>
                    {inner}
                  </button>
                );
              })}
            </div>

            <div className="border-t p-2">
              <Link href="/notifications" className="block rounded-md px-3 py-2 text-center text-sm font-medium text-primary hover:bg-muted" onClick={() => setOpen(false)}>
                عرض كل الإشعارات
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function notificationIdForm(id: string) {
  const fd = new FormData();
  fd.set("notificationId", id);
  return fd;
}