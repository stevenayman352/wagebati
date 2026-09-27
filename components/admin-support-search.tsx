"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Searches the support inbox. The query lives in the URL as `?q=` so a search is
 * shareable and survives a refresh, and it is applied on the server — the inbox
 * matches on message text, not just what is currently on screen.
 *
 * The active status filter is preserved because it is already in the query string.
 */
export function AdminSupportSearch({ initial }: { initial: string }) {
  return (
    <Suspense fallback={<SearchFieldSkeleton initial={initial} />}>
      <SearchField initial={initial} />
    </Suspense>
  );
}

function SearchFieldSkeleton({ initial }: { initial: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input dir="rtl" readOnly value={initial} placeholder="ابحث باسم المحادثة أو الكود أو نص رسالة..." className="h-10 ps-9" />
    </div>
  );
}

function SearchField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dirty = useRef(false);

  // Keep in step when the URL changes from outside (back button, filter chips).
  useEffect(() => {
    if (!dirty.current) setValue(initial);
  }, [initial]);

  useEffect(() => {
    if (!dirty.current) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const q = value.trim();
      if (q) params.set("q", q);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      dirty.current = false;
    }, 350);
    return () => clearTimeout(handle);
  }, [value, pathname, router, searchParams]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        dir="rtl"
        type="search"
        value={value}
        placeholder="ابحث باسم المحادثة أو الكود أو نص رسالة..."
        aria-label="بحث في محادثات الدعم"
        className="h-10 ps-9 pe-9"
        onChange={(e) => {
          dirty.current = true;
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            dirty.current = true;
            setValue("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="مسح البحث"
          onClick={() => {
            dirty.current = true;
            setValue("");
          }}
          className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
