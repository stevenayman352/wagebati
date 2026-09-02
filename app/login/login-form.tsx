"use client";

import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { LogIn } from "lucide-react";

export function LoginForm({
  configured,
  errorText
}: {
  configured: boolean;
  errorText: string | null;
}) {
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
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo className="size-24 rounded-[28px] shadow-raise" priority />
          <h1 className="mt-5 font-amiri text-4xl font-bold leading-tight">
            أهلاً بيك في <span className="text-primary">واجباتي</span>
          </h1>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-raise backdrop-blur-sm sm:p-6">
          <h2 className="mb-4 font-bold">تسجيل الدخول</h2>

          <form action={signInAction} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="code">كود الحساب</Label>
              <Input
                id="code"
                name="code"
                placeholder="مثال: 4821"
                autoComplete="username"
                required
                dir="ltr"
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
                required
              />
            </div>

            {!configured ? (
              <p className="text-sm text-destructive">
                أضف مفاتيح Supabase في ملف .env ثم أعد تشغيل الخادم.
              </p>
            ) : null}
            {errorText ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorText}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={!configured} className="mt-1 gap-2">
              <LogIn className="size-4" />
              دخول
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
         لو معندكش حساب اتواصل مع الإدارة و هم يعملولك حساب ويبعتولك البيانات بتاعته .
        </p>
      </div>
    </main>
  );
}