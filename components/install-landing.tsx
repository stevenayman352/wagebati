"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, MonitorSmartphone, MousePointerClick, Share, Download, Plus, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const LOGIN_PATH = "/login";

function isStandalone() {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)");
  if (displayMode?.matches) return true;
  // iOS Safari exposes navigator.standalone for Home-screen web apps.
  if ("standalone" in navigator && (navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /ipad|ipod|iphone/i.test(ua);
}

const iosSteps = [
  { icon: Share, text: "اضغط على زر المشاركة في أسفل الشاشة." },
  { icon: Download, text: "مرر للأسفل واختر \"إضافة إلى الشاشة الرئيسية\" (Add to Home Screen)." },
  { icon: Plus, text: "اضغط على \"إضافة\" (Add) في الزاوية العلوية اليمنى." }
];

export function InstallLanding() {
  const router = useRouter();
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const goToLogin = useCallback(() => {
    if (redirecting) return;
    setRedirecting(true);
    router.replace(LOGIN_PATH);
  }, [router, redirecting]);

  // Already running as an installed PWA → go straight to login.
  useEffect(() => {
    if (!isStandalone()) return;
    const t = setTimeout(() => goToLogin(), 0);
    return () => clearTimeout(t);
  }, [goToLogin]);

  // Capture the deferred install prompt before the user clicks (Android/Chrome).
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as InstallPromptEvent;
    };
    const onInstalled = () => goToLogin();
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [goToLogin]);

  // Close the iOS sheet on Escape (desktop/accessibility).
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const handleStart = async () => {
    if (sheetOpen || redirecting) return;

    const prompt = deferredPrompt.current;
    if (prompt) {
      // Native PWA install prompt is available → use it.
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        goToLogin();
      }
      // Dismissed → stay on the page, do not claim success.
      return;
    }

    if (isIOS()) {
      setSheetOpen(true);
      return;
    }

    // Unsupported / prompt already consumed / not installable → don't trap the user.
    goToLogin();
  };

  const handleSheetDone = () => {
    setSheetOpen(false);
    goToLogin();
  };

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-white" dir="rtl">
      {/* Soft indigo glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 start-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -end-24 bottom-0 size-64 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <BrandLogo className="size-24 rounded-[28px] shadow-raise" priority />

        <h1 className="mt-7 text-[var(--text-display)] font-extrabold leading-tight text-[#111827]">
          أهلاً بك في تطبيق <span className="text-primary">واجباتي</span>
        </h1>

        <p className="mt-4 max-w-sm text-base leading-relaxed text-[#374151]">
          للوصول السريع والسهل إلى واجباتك، سنقوم بإضافة تطبيق &quot;واجباتي&quot; إلى شاشة هاتفك
          الرئيسية. الأمر بسيط وسريع!
        </p>

        <Button
          type="button"
          size="lg"
          onClick={handleStart}
          disabled={redirecting}
          className="press mt-10 min-h-12 w-full gap-2.5 rounded-2xl px-6 text-base font-bold shadow-raise"
        >
          <AppWindow className="size-5" />
          {redirecting ? "جارٍ التحويل..." : "حسناً، لنبدأ"}
        </Button>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MonitorSmartphone className="size-3.5" />
          سيفتح تطبيق وجباتي مباشرة من شاشة هاتفك الرئيسية
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          بعد تسجيل الدخول، فعّل إشعارات واجباتي لتصلك التنبيهات على هاتفك.
        </p>
      </div>

      {/* iOS bottom sheet */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300",
          sheetOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
      >
        {/* Overlay */}
        <button
          type="button"
          aria-label="إغلاق الشرح"
          onClick={() => setSheetOpen(false)}
          className="absolute inset-0 cursor-default bg-foreground/30"
          tabIndex={-1}
        />

        {/* Sheet */}
        <div
          className="relative z-10 w-full max-w-md rounded-t-[28px] bg-white px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3 shadow-raise"
          style={{
            transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)"
          }}
        >
          {/* Drag indicator */}
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" aria-hidden />

          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id="install-sheet-title" className="font-extrabold text-lg text-[#111827]">
              تثبيت التطبيق على آيفون
            </h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="إغلاق"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>

          <ul className="mt-4 space-y-4">
            {iosSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={i} className="flex items-start gap-3" style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="pt-1">
                    <span className="mb-0.5 block text-xs font-bold text-primary">الخطوة {i + 1}</span>
                    <p className="text-sm leading-relaxed text-[#374151]">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            size="lg"
            onClick={handleSheetDone}
            className="mt-7 min-h-12 w-full rounded-2xl text-base font-bold"
          >
            <MousePointerClick className="size-5" />
            فهمت
          </Button>
        </div>
      </div>
    </main>
  );
}