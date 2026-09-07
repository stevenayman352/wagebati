import { Skeleton } from "@/components/ui/skeleton";
import { BrandLogo } from "@/components/brand-logo";

export function AppPageLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4" dir="rtl">
      <div className="flex items-center gap-2">
        <BrandLogo className="size-9 rounded-xl" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="hidden h-24 rounded-2xl sm:block" />
      </div>
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </main>
  );
}

export function ChatPageLoading() {
  return (
    <main className="flex h-dvh flex-col gap-4 p-4" dir="rtl">
      <div className="flex items-center gap-2">
        <BrandLogo className="size-9 rounded-xl" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-14 rounded-2xl" />
      <div className="min-h-0 flex-1 rounded-2xl border border-border/70 bg-card p-4">
        <div className="grid gap-3">
          <Skeleton className="h-12 w-3/4 rounded-2xl" />
          <Skeleton className="ms-auto h-12 w-3/5 rounded-2xl" />
          <Skeleton className="h-12 w-2/5 rounded-2xl" />
        </div>
      </div>
    </main>
  );
}