"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Sends a signed-in user from the root URL to their dashboard with a
 * client-side navigation.
 *
 * A server redirect would arrive as a fresh browser navigation
 * (`Sec-Fetch-Site: none`), which the navigation guard treats like a typed
 * URL and bounces to /login. Doing it with the router keeps PWA launches
 * (`start_url: "/"`) and the post-login path working.
 */
export function HomeRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return null;
}
