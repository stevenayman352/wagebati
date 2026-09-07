"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Settings, X } from "lucide-react";

type NotificationState = NotificationPermission | "checking";

export function NotificationGate({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<NotificationState>("checking");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if ("Notification" in window) {
        setPermission(Notification.permission);
      } else {
        setPermission("granted");
      }
    });

    const sync = () => {
      if ("Notification" in window) setPermission(Notification.permission);
    };
    window.addEventListener("permissionchange", sync);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("permissionchange", sync);
    };
  }, []);

  async function requestPermission() {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") setDismissed(true);
    }
  }

  const needsPrompt =
    !dismissed && permission !== "checking" && permission !== "granted";

  return (
    <>
      {needsPrompt ? (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center bg-card/95 px-4 py-2.5 shadow-md backdrop-blur-xl sm:px-6"
        >
          <div className="flex w-full max-w-5xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 text-sm">
              {permission === "denied" ? (
                <BellOff className="size-4 shrink-0 text-warning" />
              ) : (
                <Bell className="size-4 shrink-0 text-primary" />
              )}
              {permission === "denied" ? (
                <p className="min-w-0 truncate text-muted-foreground">
                  الإشعارات محظورة من إعدادات المتصفح.
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      void requestPermission();
                    }}
                    className="hover:underline"
                  >
                    افتح الإعدادات
                  </a>
                </p>
              ) : (
                <p className="min-w-0 truncate text-muted-foreground">فعّل الإشعارات لتصلك تنبيهات الواجبات.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {permission === "denied" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
                  <Settings className="size-3.5" />
                  إعدادات
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => void requestPermission()}>
                  تفعيل
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-full"
                onClick={() => setDismissed(true)}
                aria-label="إخفاء"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}