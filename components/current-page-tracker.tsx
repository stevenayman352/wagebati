"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CURRENT_PAGE_COOKIE } from "@/lib/navigation-guard";

/**
 * Remembers the page currently shown to the browser so the navigation guard
 * can tell a reload apart from typing another page's URL. Both arrive with
 * `Sec-Fetch-Site: none`; only the requested path differs from this cookie.
 *
 * This runs on every route change, including `router.push()` navigations.
 */
export function CurrentPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const value = encodeURIComponent(pathname);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${CURRENT_PAGE_COOKIE}=${value}; path=/; max-age=604800; samesite=lax${secure}`;
  }, [pathname]);

  return null;
}
