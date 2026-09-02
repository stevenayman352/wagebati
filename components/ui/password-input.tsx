"use client";

import * as React from "react";
import { unstable_PasswordToggleField as PasswordToggleField } from "radix-ui";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "autoComplete"> & {
  autoComplete?: "current-password" | "new-password";
}) {
  return (
    <PasswordToggleField.Root>
      <span className="relative block">
        <PasswordToggleField.Input
          data-slot="input"
          className={cn(
            "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            className
          )}
          {...props}
        />
        <PasswordToggleField.Toggle
          aria-label="إظهار كلمة المرور"
          className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
        >
          <PasswordToggleField.Icon
            visible={<EyeOff className="size-4" />}
            hidden={<Eye className="size-4" />}
          />
        </PasswordToggleField.Toggle>
      </span>
    </PasswordToggleField.Root>
  );
}

export { PasswordInput };