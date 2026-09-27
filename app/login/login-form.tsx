"use client";

import { useTransition } from "react";
import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { ChevronLeft, LifeBuoy, LogIn } from "lucide-react";

export function LoginForm({
  configured,
  errorText
}: {
  configured: boolean;
  errorText: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden" dir="rtl">
      {/* Soft brand glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55rem 45rem at 50% -15%, oklch(0.5 0.2 262 / 0.1), transparent 70%)"
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -start-20 -top-24 size-56 rounded-full bg-gold/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -end-24 top-1/3 size-60 rounded-full bg-cyan/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <div
          className="mb-8 flex flex-col items-center text-center"
          style={{ animation: "page-in 0.4s ease-out both", animationDelay: "40ms" }}
        >
          <BrandLogo className="size-24 rounded-[28px] shadow-raise transition-transform duration-300 hover:scale-105" priority />
          <h1 className="mt-5 font-amiri text-4xl font-bold leading-tight">
            أهلاً بيك في <span className="text-primary">واجباتي</span>
          </h1>
        </div>

        <div
          className="rounded-2xl border border-border/70 bg-card p-5 shadow-raise backdrop-blur-sm sm:p-6"
          style={{ animation: "slide-up 0.3s ease-out both", animationDelay: "110ms" }}
        >
          <h2 className="mb-4 font-bold">تسجيل الدخول</h2>

          <form
            action={(formData) => {
              startTransition(async () => {
                await signInAction(formData);
              });
            }}
            className="grid gap-4"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="code">كود الحساب</Label>
              <Input
                id="code"
                name="code"
                placeholder="مثال: 4821"
                autoComplete="username"
                required
                dir="ltr"
                disabled={pending}
                className="text-center tracking-[0.35em]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">كلمة المرور</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="text-center"
                disabled={pending}
                required
              />
            </div>

            {!configured ? (
              <p className="text-sm text-destructive">
                أضف مفاتيح Supabase في ملف .env ثم أعد تشغيل الخادم.
              </p>
            ) : null}
            {errorText ? (
              <p className="animate-pop rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorText}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={!configured || pending} className="mt-1 gap-2">
              {pending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <LogIn className="size-4" />
              )}
              {pending ? "جارِ الدخول..." : "دخول"}
            </Button>
          </form>
        </div>

        <Link
          href="/support"
          prefetch={true}
          className="group relative mt-6 flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-start shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.1] hover:shadow-raise active:translate-y-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          style={{ animation: "slide-up 0.3s ease-out both", animationDelay: "190ms" }}
        >
          <span className="relative flex size-11 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 animate-splash-halo rounded-full bg-primary/30 blur-md"
            />
            <span className="relative flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_oklch(0.5_0.2_262/0.5)] transition-transform duration-200 group-hover:scale-105">
              <LifeBuoy className="size-6" />
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-extrabold">
              محتاج مساعدة او عندك مشكلة؟
              <span className="rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-bold text-primary-foreground">
                تواصل مع الدعم
              </span>
            </span>
          </span>

          <ChevronLeft className="size-5 shrink-0 text-primary transition-transform duration-200 group-hover:-translate-x-1" />
        </Link>
      </div>
    </main>
  );
}