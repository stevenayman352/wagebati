"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePushSubscriptionAction, getVapidPublicKeyAction, savePushSubscriptionAction } from "@/app/actions/push";

type Status = "checking" | "unsupported" | "idle" | "granting" | "done" | "denied" | "failed";

const LOCK = "🔔";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushEnabler() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setStatus("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        if (registration) {
          const existing = await registration.pushManager.getSubscription();
          if (existing && active) setStatus("done");
          else if (active) setStatus("idle");
        } else if (active) {
          setStatus("idle");
        }
      } catch {
        if (active) setStatus("idle");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setStatus("granting");
    setError(null);
    try {
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await persist(existing);
        setStatus("done");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const publicKey = await getVapidPublicKeyAction();
      const keyBytes = urlBase64ToUint8Array(publicKey);
      if (keyBytes.length !== 65 || keyBytes[0] !== 4) {
        throw new Error("مفتاح الدفع غير صالح.");
      }
      const subscription = await subscribeWithRetry(registration, keyBytes.slice().buffer);
      await persist(subscription);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("failed");
      setError(err instanceof Error ? err.message : "تعذر تفعيل الإشعارات.");
    }
  }

  async function subscribeWithRetry(
    registration: ServiceWorkerRegistration,
    applicationServerKey: ArrayBuffer
  ): Promise<PushSubscription> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      } catch (err) {
        const last = attempt === 2;
        if (last) throw err;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        const fresh = await navigator.serviceWorker.ready;
        if (fresh.installing || fresh.waiting) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    throw new Error("تعذر الاشتراك في خدمة الدفع.");
  }

  async function persist(subscription: PushSubscription) {
    const json = subscription.toJSON();
    const fd = new FormData();
    fd.set("endpoint", subscription.endpoint);
    fd.set("p256dh", json.keys?.p256dh ?? "");
    fd.set("auth", json.keys?.auth ?? "");
    const result = await savePushSubscriptionAction(fd);
    if (!result.ok) throw new Error(result.message);
  }

  async function disable() {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        const fd = new FormData();
        if (subscription) {
          fd.set("endpoint", subscription.endpoint);
          await subscription.unsubscribe();
        }
        await deletePushSubscriptionAction(fd);
      }
    } catch (err) {
      console.error(err);
    }
    setStatus("idle");
  }

  if (status === "checking") return null;

  return (
    <section className="mb-4 flex flex-col items-start gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none" aria-hidden>
          {LOCK}
        </span>
        <div>
          <p className="font-medium">الإشعارات الفورية</p>
          <p className="text-sm text-muted-foreground">
            {status === "done"
              ? "مفعلة — ستظهر التنبيهات حتى عند إغلاق التطبيق."
              : status === "denied"
                ? "تم رفض الإذن من المتصفح. فعّله من إعدادات الموقع."
                : status === "unsupported"
                  ? "لا يدعم متصفحك الإشعارات الفورية."
                  : status === "failed"
                    ? `تعذر التفعيل. ${error ?? ""}`
                    : "فعّل الإشعارات لتصلك التنبيهات على هذا الجهاز."}
          </p>
        </div>
      </div>
      {status === "done" ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void disable()}>
          إيقاف
        </Button>
      ) : status === "unsupported" || status === "denied" ? null : (
        <Button type="button" size="sm" onClick={() => void enable()} disabled={status === "granting"}>
          {status === "granting" ? "جارٍ التفعيل..." : "تفعيل الإشعارات"}
        </Button>
      )}
    </section>
  );
}