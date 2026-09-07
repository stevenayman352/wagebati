"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

const MIN_DISPLAY_MS = 500;
const FADE_MS = 300;

const PHRASES = ["جارِ تحميل بياناتك...", "كله جاهز، على وشك الدخول..."];

export function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "fade" | "removed">("show");
  const [step, setStep] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    let disposed = false;
    let fadeT: ReturnType<typeof setTimeout> | undefined;

    const fadeOut = () => {
      fadeT = setTimeout(() => {
        if (!disposed) setPhase("fade");
      }, Math.max(0, MIN_DISPLAY_MS - (performance.now() - startedAt)));
    };

    if (document.readyState === "complete") {
      fadeOut();
    } else {
      window.addEventListener("load", fadeOut, { once: true });
    }

    return () => {
      disposed = true;
      if (fadeT) clearTimeout(fadeT);
      window.removeEventListener("load", fadeOut);
    };
  }, []);

  useEffect(() => {
    if (phase !== "fade") return;
    const t = setTimeout(() => setPhase("removed"), FADE_MS + 150);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "removed") return;
    const t = setInterval(() => setStep((s) => (s + 1) % PHRASES.length), 1400);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === "removed") return null;

  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-0 z-[10000] flex flex-col items-center justify-center overflow-hidden bg-background",
        "transition-opacity duration-700 ease-out",
        phase === "fade" ? "pointer-events-none opacity-0" : "opacity-100"
      )}
    >
      {/* Brand glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50rem 42rem at 50% -12%, oklch(0.5 0.2 262 / 0.12), transparent 70%)"
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -start-24 -top-28 size-72 rounded-full bg-gold/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -end-28 bottom-1/4 size-72 rounded-full bg-cyan/10 blur-3xl" />

      <div className="relative flex flex-col items-center px-6 text-center animate-slide-up">
        {/* Logo with pulsing halo */}
        <span className="relative inline-flex">
          <span aria-hidden className="absolute inset-0 rounded-[34px] bg-primary/25 animate-splash-halo" />
          <BrandLogo className="relative size-28 rounded-[34px] shadow-raise sm:size-32" priority />
        </span>

        <h1
          className="mt-6 font-amiri text-4xl font-bold leading-tight sm:text-5xl animate-slide-up"
          style={{ animationDelay: "120ms" }}
        >
          واجباتي
        </h1>
        <p
          className="mt-1.5 text-sm font-semibold text-muted-foreground animate-slide-up"
          style={{ animationDelay: "220ms" }}
        >
          جوق الحان مدرسة الشمامسة
        </p>

        {/* Premium indeterminate progress */}
        <div className="mt-9 w-60 overflow-hidden rounded-full bg-primary/10 sm:w-64">
          <div className="h-1.5 w-1/2 rounded-full bg-gradient-to-r from-primary via-cyan to-gold animate-splash-shimmer" />
        </div>

        {/* Cycling status text */}
        <div className="relative mt-4 h-6">
          {PHRASES.map((phrase, i) => (
            <p
              key={phrase}
              className={cn(
                "absolute inset-x-0 text-xs font-semibold text-muted-foreground transition-opacity duration-500",
                i === step ? "opacity-100" : "opacity-0"
              )}
            >
              {phrase}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}