"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallbackHref = "/teacher" }: { fallbackHref?: string }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-mx-2 text-muted-foreground"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) router.back();
        else if (fallbackHref) router.replace(fallbackHref);
      }}
    >
      <ArrowLeft className="size-4" />
      رجوع
    </Button>
  );
}