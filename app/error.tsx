"use client";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
      <BrandLogo className="size-20 rounded-3xl" />
      <h1 className="text-2xl font-bold text-foreground">حدث خطأ ما</h1>
      <p className="max-w-md text-muted-foreground">
        تعذّر تحميل هذه الصفحة. حاول مرة أخرى، وإذا استمرت المشكلة أعد تحميل الصفحة.
      </p>
      <Button type="button" onClick={reset}>
        إعادة المحاولة
      </Button>
    </main>
  );
}