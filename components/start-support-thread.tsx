"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { startStudentThreadAction } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

/**
 * A student has exactly one support conversation, so there is no list and no
 * thread id in the URL. Creating it is a plain action and the same route
 * re-renders into the chat.
 */
export function StartSupportThread() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        size="lg"
        className="h-11 gap-2 px-5 text-base"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await startStudentThreadAction();
            if (!result.ok || !result.threadId) {
              setError(result.message || "تعذر بدء المحادثة.");
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <LifeBuoy className="size-5" />
        )}
        {pending ? "جارِ الفتح..." : "ابدأ محادثة مع الدعم"}
      </Button>
      {error ? (
        <p role="alert" className="animate-pop text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
