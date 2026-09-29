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
    // min-w-0 is load-bearing: this section is a grid item, and a grid item's
    // default min-width is its content's min-content width. One wide child (a long
    // message preview, a table, an unbreakable string) therefore stretched the
    // whole section past the viewport and dragged the page into a horizontal
    // scroll. min-w-0 lets the section shrink to its track and lets the child
    // handle the overflow instead.
    <section className="min-w-0 rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12">
          <Icon className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-bold leading-tight">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
