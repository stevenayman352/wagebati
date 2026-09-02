import type { ElementType, ReactNode } from "react";

export function AdminSection({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: ElementType;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12">
          <Icon className="size-4 text-primary" />
        </span>
        <div>
          <h2 className="font-bold leading-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
