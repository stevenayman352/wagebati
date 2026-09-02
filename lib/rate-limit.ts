type RateLimitRequest = {
  headers: { get(name: string): string | null };
  nextUrl: { pathname: string };
};

/**
 * Lightweight in-process sliding-window rate limiter, keyed by a client
 * identifier (IP address). No external dependency or infrastructure.
 *
 * Intended for Vercel serverless: it provides effective protection on a single
 * instance / dev and works as a first line of defense in production. Because a
 * serverless deployment can run multiple warm instances, this is per-instance
 * and NOT a hard global quota — treat bounds as a coarse safety net, not a
 * strict commitment. Do not use it to enforce compliance-critical limits.
 *
 * Call sites still enforce their own authorization (auth + RLS + bearer
 * secrets); this is defense-in-depth against bursts / scraping.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit({
  request,
  max,
  windowMs
}: {
  request: RateLimitRequest;
  max: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const key = `${ip}:${request.nextUrl.pathname}`;
  const cur = buckets.get(key);

  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (cur.count >= max) {
    return { allowed: false, remaining: 0, retryAfterMs: cur.resetAt - now };
  }

  cur.count += 1;
  return { allowed: true, remaining: max - cur.count, retryAfterMs: 0 };
}