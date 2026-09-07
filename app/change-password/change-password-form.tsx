"use client";

import { useState, useTransition } from "react";
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
import { ShieldCheck, Check, Circle } from "lucide-react";

const errorMessages: Record<string, string> = {
  too_short: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  mismatch: "كلمتا المرور غير متطابقتين",
  wrong_current: "كلمة المرور الحالية غير صحيحة",
  failed: "تعذر تغيير كلمة المرور، حاول مرة أخرى",
  not_configured: "إعدادات النظام غير مكتملة"
};

type PasswordCheck = {
  key: string;
  labelAr: string;
  labelEn: string;
  example?: string;
  test: (password: string) => boolean;
};

const PASSWORD_CHECKS: PasswordCheck[] = [
  {
    key: "minLength",
    labelAr: "8 أحرف على الأقل",
    labelEn: "At least 8 characters",
    example: "Abcdef1!",
    test: (p) => p.length >= 8,
  },
  {
    key: "hasNumber",
    labelAr: "رقم واحد على الأقل",
    labelEn: "At least 1 number",
    example: "1",
    test: (p) => /\d/.test(p),
  },
  {
    key: "hasLetter",
    labelAr: "حرف واحد على الأقل",
    labelEn: "At least 1 letter",
    example: "A",
    test: (p) => /[a-zA-Zأ-ي]/.test(p),
  },
  {
    key: "hasSpecial",
    labelAr: "رمز خاص واحد على الأقل",
    labelEn: "At least 1 special character",
    test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p),
  },
];

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
  const [newPassword, setNewPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const checkResults = PASSWORD_CHECKS.map((check) => ({
    ...check,
    passed: check.test(newPassword),
  }));

  const allPassed = checkResults.every((c) => c.passed);

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value);
    if (submitted) setSubmitted(false);
  };

  const handleSubmit = async (formData: FormData) => {
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("new") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    setSubmitError(null);
    setSubmitted(true);

    if (next.length < 8) {
      setSubmitError("كلمة المرور يجب أن تكون 8 أحرف على الأقل / Password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      setSubmitError("كلمتا المرور غير متطابقتين / Passwords do not match");
      return;
    }

    const failedChecks = checkResults.filter((c) => !c.passed);
    if (failedChecks.length > 0) {
      setSubmitError("يرجى استيفاء جميع متطلبات كلمة المرور / Please meet all password requirements");
      return;
    }

    startTransition(async () => {
      await changePasswordAction(formData);
    });
  };

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
              action={handleSubmit}
              className="grid gap-4"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="current">كلمة المرور الحالية</Label>
                <PasswordInput id="current" name="current" autoComplete="current-password" required disabled={pending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new">كلمة المرور الجديدة</Label>
                <PasswordInput
                  id="new"
                  name="new"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={pending}
                  value={newPassword}
                  onChange={handleNewPasswordChange}
                  aria-invalid={submitted && !allPassed}
                />
              </div>

              <div className="grid gap-1.5 mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>متطلبات كلمة المرور / Password Requirements</span>
                  <span className={allPassed ? "text-green-500" : "text-muted-foreground"}>
                    {checkResults.filter((c) => c.passed).length} / {checkResults.length}
                  </span>
                </div>
                <div className="grid gap-1.5" role="list" aria-label="Password requirements">
                  {checkResults.map((check) => (
                    <div
                      key={check.key}
                      className={`flex items-center gap-2 text-sm transition-all duration-200 ${
                        submitted && !check.passed ? "text-destructive animate-pulse" : ""
                      }`}
                      role="listitem"
                    >
                      {check.passed ? (
                        <Check className="size-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="flex-1">{check.labelAr} / {check.labelEn}</span>
                      {check.example && (
                        <span className="text-xs text-muted-foreground font-mono px-2 py-0.5 rounded bg-muted">
                          مثال: {check.example}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="confirm">تأكيد كلمة المرور الجديدة</Label>
                <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} disabled={pending} />
              </div>
              {!configured ? <p className="text-sm text-destructive">إعدادات النظام غير مكتملة.</p> : null}
              {submitError ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-shake">{submitError}</p>
              ) : errorText ? (
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

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </main>
  );
}
