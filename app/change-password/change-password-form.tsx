"use client";

import { useTransition } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

const errorMessages: Record<string, string> = {
  too_short: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  mismatch: "كلمتا المرور غير متطابقتين",
  wrong_current: "كلمة المرور الحالية غير صحيحة",
  failed: "تعذر تغيير كلمة المرور، حاول مرة أخرى",
  not_configured: "إعدادات النظام غير مكتملة"
};

export function ChangePasswordForm({
  configured,
  errorText,
  isFirst
}: {
  configured: boolean;
  errorText: string | null;
  isFirst: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, oklch(0.5 0.2 262 / 0.1), transparent 70%)"
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary shadow-raise">
            <ShieldCheck className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-[var(--text-h1)] font-extrabold">تغيير كلمة المرور</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFirst
              ? "لأسباب أمنية يجب تعيين كلمة مرور جديدة قبل الاستخدام."
              : "أدخل بياناتك لتحديث كلمة المرور."}
          </p>
        </div>

        <Card className="border-border/70 shadow-raise">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">كلمة مرور جديدة</CardTitle>
            <CardDescription className="text-sm">اختر كلمة مرور قوية لا تقل عن 8 أحرف</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={(formData) => {
                startTransition(async () => {
                  await changePasswordAction(formData);
                });
              }}
              className="grid gap-4"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="current">كلمة المرور الحالية</Label>
                <PasswordInput id="current" name="current" autoComplete="current-password" required disabled={pending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new">كلمة المرور الجديدة</Label>
                <PasswordInput id="new" name="new" autoComplete="new-password" required minLength={8} disabled={pending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirm">تأكيد كلمة المرور الجديدة</Label>
                <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} disabled={pending} />
              </div>
              {!configured ? <p className="text-sm text-destructive">إعدادات النظام غير مكتملة.</p> : null}
              {errorText ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorText}</p>
              ) : null}
              <Button type="submit" size="lg" disabled={!configured || pending} className="mt-1 gap-2">
                {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {pending ? "جارِ الحفظ..." : "حفظ"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
