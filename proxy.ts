import { NextResponse, after, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ensureOverdueConversationsClosed } from "@/lib/close-overdue";

const OVERDUE_CHECK_INTERVAL_MS = 60_000;
let lastOverdueCheck = 0;

export async function proxy(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  // Optimistic check only: when there is no Supabase session cookie there is
  // nothing to validate or refresh, so skip the auth API round-trip that
  // would otherwise run on every request (including route prefetches).
  //
  // A prefetch is a speculative request for a route the router only *might*
  // navigate to. The pages guard themselves with requireRole()/getCurrentProfile(),
  // which authenticate independently of this proxy, so spending an auth
  // round-trip per prefetch buys nothing — and with `partialPrefetching` on,
  // a page carrying a couple of dozen links produces a couple of dozen
  // prefetches, each of which was a function invocation plus a network call.
  // The real navigation still passes through here and refreshes the session.
  // Next sets `next-router-prefetch` on full prefetches and
  // `next-router-segment-prefetch` on segment prefetches, so either header
  // being present means "speculative".
  const isPrefetch =
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("next-router-segment-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch";
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hasAuthCookie && !isPrefetch) {
    // Refresh-only. `getSession()` resolves the stored session locally and only
    // calls the Auth API when the access token is actually within its expiry
    // margin, in which case it refreshes and writes the rotated cookies through
    // `setAll` above — so session lifetime is preserved. `getUser()` used to be
    // called here, which unconditionally issued a `GET /auth/v1/user` round trip
    // on every authenticated navigation even though the result was discarded.
    //
    // Authorization is unaffected: this proxy has never gated access on the
    // result (it never redirects or blocks) and never will. The authoritative
    // identity/role check stays in `getCurrentProfile()` (`getUser()`), which
    // runs inside every protected page, Server Action and API route.
    await supabase.auth.getSession();

    // Close any conversations whose assignment deadline has passed. Runs after
    // the response is sent so it never blocks the request, and is throttled so
    // a burst of requests only triggers one check per instance per minute.
    const now = Date.now();
    if (now - lastOverdueCheck >= OVERDUE_CHECK_INTERVAL_MS) {
      lastOverdueCheck = now;
      after(() => ensureOverdueConversationsClosed().catch(() => {}));
    }
  }
  return supabaseResponse;
}

export const config = {
  // Public static assets never need a session refresh or the overdue sweep, so
  // they are excluded from the proxy entirely instead of paying a function
  // invocation for every icon, font, wasm binary or client chunk requested.
  // This is the negative-match pattern the Next.js Proxy docs recommend.
  //
  // This does not weaken protection: the proxy has never blocked a request
  // based on auth (it only propagates refreshed cookies), these are public
  // files served from /public, and every protected page still guards itself
  // with requireRole()/getCurrentProfile(). Route params in this app are UUIDs
  // (and guest support links carry the token in the query string, not the
  // path), so no legitimate path ends in one of these extensions.
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|json|wasm|ttf|otf|woff2?|eot|mp3|mp4|webm|wav|pdf|pptx?|txt|xml|webmanifest|html)$).*)"
  ]
};
