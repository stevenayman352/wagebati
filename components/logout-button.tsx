"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(async () => {
          await signOutAction();
        });
      }}
    >
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "جارِ الخروج..." : "خروج"}
      </Button>
    </form>
  );
}