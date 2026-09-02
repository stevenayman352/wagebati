import { Skeleton } from "@/components/ui/skeleton";
import { BrandLogo } from "@/components/brand-logo";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <BrandLogo className="size-10 rounded-xl" />
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="hidden h-24 rounded-2xl lg:block" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
    </main>
  );
}