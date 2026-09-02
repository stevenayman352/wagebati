import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page shell: centered max-width column (premium SaaS feel on
 * desktop, full-width comfortable on mobile) with top/bottom padding that
 * reserves space for the mobile bottom navigation.
 */
export function PageShell({
  children,
  className,
  wide,
  mainClassName
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  mainClassName?: string;
}) {
  return (
    <main
      dir="rtl"
      className={cn("mx-auto w-full max-w-5xl px-4 pb-24 pt-5 md:px-6 md:pb-28 md:pt-10", mainClassName)}
    >
      <div className={cn(wide ? "" : "mx-auto max-w-3xl", className)}>{children}</div>
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  children
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {typeof title === "string" ? <h1 className="text-[var(--text-h1)] font-extrabold">{title}</h1> : title}
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
}
