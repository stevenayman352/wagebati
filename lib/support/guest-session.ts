/**
 * Where a guest's conversation pointer lives between visits.
 *
 * A guest has no account, so the only way back to their thread is the capability
 * token. That pointer is kept in a cookie rather than `localStorage` for one
 * specific reason: `/support` has to decide on the *server* whether to offer
 * "continue" or "start a new conversation". A `localStorage` read only happens
 * after hydration, which would briefly render the new-thread form to a returning
 * guest — exactly the thing we must not show them. A cookie is readable during
 * the server render, so the continue-only state is the first and only thing they
 * ever see.
 *
 * The value is `threadId.token`. Both halves are URL-safe by construction (a uuid
 * and base64url), and `.` appears in neither, so no encoding round-trip is needed
 * and a malformed value can be rejected with a cheap shape check.
 */

export const GUEST_THREAD_COOKIE = "support_thread";

/** 30 days. The thread itself only lives until the guest signs in. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type GuestThreadPointer = { threadId: string; token: string };

export function serializeGuestThreadPointer(threadId: string, token: string) {
  return `${threadId}.${token}`;
}

/**
 * Parses a cookie value, returning null for anything malformed. Never throws:
 * a guest arriving with a hand-edited cookie should get the normal new-thread
 * page, not an error page.
 */
export function parseGuestThreadPointer(raw: string | undefined | null): GuestThreadPointer | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const threadId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!UUID_RE.test(threadId) || !TOKEN_RE.test(token)) return null;
  return { threadId, token };
}

export function guestThreadOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/support",
    maxAge: MAX_AGE_SECONDS
  };
}

/** The only URL that can reopen a guest thread; possession of `k` is the credential. */
export function guestThreadHref(threadId: string, token: string) {
  return `/support/${threadId}?k=${encodeURIComponent(token)}`;
}
