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
  // Authenticated flows still refresh the session via getUser() here.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hasAuthCookie) {
    await supabase.auth.getUser();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)"]
};
