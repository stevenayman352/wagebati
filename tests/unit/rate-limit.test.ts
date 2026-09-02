import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

function fakeRequest(ip: string, pathname: string) {
  return {
    headers: { get: (name: string) => (name === "x-forwarded-for" ? ip : null) },
    nextUrl: { pathname }
  } as unknown as Request & { nextUrl: { pathname: string } };
}

describe("rateLimit", () => {
  it("allows requests up to the max within the window", () => {
    const req = fakeRequest("1.2.3.4", "/api/export");
    const first = rateLimit({ request: req, max: 2, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    const second = rateLimit({ request: req, max: 2, windowMs: 60_000 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks once the max is exceeded and reports retry-after", () => {
    const req = fakeRequest("9.9.9.9", "/api/export");
    rateLimit({ request: req, max: 2, windowMs: 60_000 });
    rateLimit({ request: req, max: 2, windowMs: 60_000 });
    const blocked = rateLimit({ request: req, max: 2, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks distinct clients independently", () => {
    const a = fakeRequest("1.1.1.1", "/api/export");
    const b = fakeRequest("2.2.2.2", "/api/export");
    rateLimit({ request: a, max: 1, windowMs: 60_000 });
    expect(rateLimit({ request: a, max: 1, windowMs: 60_000 }).allowed).toBe(false);
    expect(rateLimit({ request: b, max: 1, windowMs: 60_000 }).allowed).toBe(true);
  });

  it("separates limits by route", () => {
    const reqA = fakeRequest("3.3.3.3", "/api/export");
    const reqB = fakeRequest("3.3.3.3", "/api/push/send");
    rateLimit({ request: reqA, max: 1, windowMs: 60_000 });
    expect(rateLimit({ request: reqA, max: 1, windowMs: 60_000 }).allowed).toBe(false);
    expect(rateLimit({ request: reqB, max: 1, windowMs: 60_000 }).allowed).toBe(true);
  });
});