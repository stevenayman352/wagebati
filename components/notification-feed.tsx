"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type NotificationRow = {
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

function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationFeed({ userId, initial, initialUnread }: { userId: string; initial: NotificationRow[]; initialUnread: number }) {
  const [items, setItems] = useState<NotificationRow[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const supabaseRef = useRef(createSupabaseBrowserClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`notifs-feed-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          setItems((prev) => [n, ...prev]);
          setUnread((prev) => prev + 1);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  function markOne(n: NotificationRow) {
    if (n.is_read) return;
    const fd = new FormData();
    fd.set("notificationId", n.id);
    void markNotificationReadAction(fd);
    setUnread((prev) => Math.max(0, prev - 1));
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} إشعار غير مقروء` : "لا توجد إشعارات غير مقروءة."}</p>
        <form
          action={(fd: FormData) => {
            void markAllNotificationsReadAction({ ok: false, message: "" }, fd);
            setUnread(0);
            setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
          }}
        >
          <Button type="submit" variant="outline" size="sm" disabled={unread === 0}>
            تحديد الكل مقروءًا
          </Button>
        </form>
      </div>

      {items.length === 0 ? <p className="text-muted-foreground">لا توجد إشعارات بعد.</p> : null}

      {items.map((n) => {
        const inner = (
          <div className={`flex items-start gap-3 p-4 ${n.is_read ? "" : "bg-brand/5"}`}>
            <Badge variant={n.is_read ? "outline" : "default"}>{TYPE_LABEL[n.type] ?? n.type}</Badge>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{n.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
              </div>
              {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
            </div>
            {n.is_read ? null : <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
          </div>
        );
        return n.href ? (
          <Link
            key={n.id}
            href={n.href}
            className="rounded-lg border bg-card transition-colors hover:bg-muted"
            onClick={() => markOne(n)}
          >
            {inner}
          </Link>
        ) : (
          <button key={n.id} type="button" className="block w-full rounded-lg border bg-card text-right transition-colors hover:bg-muted" onClick={() => markOne(n)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}