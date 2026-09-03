"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      setLoading(false);
      prevPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const handleStart = () => setLoading(true);
    const handleComplete = () => setLoading(false);

    // Intercept pushState/replaceState for client navigation
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      handleStart();
      return origPush.apply(this, args);
    };
    history.replaceState = function (...args) {
      handleStart();
      return origReplace.apply(this, args);
    };

    window.addEventListener("popstate", handleStart);

    // Also detect Link clicks and form submissions
    const onDocClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (anchor && anchor.href && anchor.origin === location.origin) {
        handleStart();
      }
    };
    const onFormSubmit = () => handleStart();

    document.addEventListener("click", onDocClick);
    document.addEventListener("submit", onFormSubmit);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", handleStart);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("submit", onFormSubmit);
    };
  }, []);

  // Also show during RSC streaming (after pathname change but before content ready)
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(timeout);
  }, [loading, pathname, searchParams]);

  if (!loading) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-0.5">
      <div className="h-full bg-primary animate-[loading-bar_1.5s_ease-in-out_infinite]" />
      <style>{`
        @keyframes loading-bar {
          0% { width: 0%; margin-inline-start: 0; }
          50% { width: 60%; margin-inline-start: 20%; }
          100% { width: 0%; margin-inline-start: 100%; }
        }
      `}</style>
    </div>
  );
}
