"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstallEvent(null);
  };

  return (
    <div className="fixed bottom-4 inset-x-0 z-50 px-4" dir="rtl">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg">
        <Button
          variant="default"
          size="sm"
          type="button"
          onClick={install}
          className="shrink-0"
          aria-label="تثبيت التطبيق"
        >
          <Download className="ml-1 h-4 w-4" />
          تثبيت
        </Button>
        <p className="flex-1 text-sm text-muted-foreground">
          ثبّت التطبيق على جهازك لتجربة أسرع مثل التطبيق الأصلي.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="إغلاق"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
