/**
 * Browser-navigation guard for the authenticated app pages.
 *
 * The app is meant to be navigated from inside its own UI. A page opened as a
 * fresh browser navigation — a typed/pasted URL, a bookmark, a link from
 * another site, a notification deep link — is bounced to the login page.
 * In-app navigations are untouched:
 *
 * - `<Link>` / `router.push()` navigations are RSC fetches, not document
 *   requests, so they never reach this check.
 * - Server Actions are POSTs and are ignored as well.
 * - Same-origin link clicks and same-origin redirects (HTTP document loads)
 *   are allowed, because they are UI-triggered.
 *
 * `Sec-Fetch-Site: none` covers typed/pasted URLs, bookmarks, reloads and
 * back/forward — the browser does not distinguish them. Reloading the page
 * that is already open is therefore allowed by comparing against the
 * `CURRENT_PAGE_COOKIE` that `CurrentPageTracker` keeps up to date. The cookie
 * is a UX hint only. It is NOT a security boundary: the authoritative gate is
 * `requireRole()` in every page, Server Action and API route.
 */

const PROTECTED_PAGE_PREFIXES = [
  "/admin",
  "/teacher",
  "/student",
  "/notifications",
  "/preview",
  "/change-password",
  "/support"
] as const;

/** Last page the client rendered; used only to allow same-page reloads. */
export const CURRENT_PAGE_COOKIE = "wajebaty_page";

/** Segment-aware prefix match, so `/admin` does not match `/administrator`. */
export function isProtectedAppPath(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

type HeaderReader = { get(name: string): string | null };

/**
 * True for a top-level browser page load (address bar, link, reload, history)
 * and false for router RSC fetches, Server Actions and other subresources.
 */
export function isBrowserDocumentNavigation(method: string, headers: HeaderReader) {
  if (method !== "GET") return false;

  const dest = headers.get("sec-fetch-dest");
  if (dest) return dest === "document";

  // Browsers without Fetch Metadata still send `Accept: text/html` for page
  // loads. An RSC fetch asks for `*` / `text/x-component`, never HTML.
  const mode = headers.get("sec-fetch-mode");
  if (mode) return mode === "navigate";

  return (headers.get("accept") ?? "").includes("text/html");
}

export function shouldRedirectToLogin({
  method,
  pathname,
  headers,
  currentPage
}: {
  method: string;
  pathname: string;
  headers: HeaderReader;
  currentPage: string | null;
}) {
  if (!isProtectedAppPath(pathname)) return false;
  if (!isBrowserDocumentNavigation(method, headers)) return false;

  const site = headers.get("sec-fetch-site");

  // UI navigation: an in-app <a>/form GET or a same-origin server redirect.
  if (site === "same-origin") return false;

  // Opened from another website (WhatsApp, email, another domain).
  if (site === "cross-site" || site === "same-site") return true;

  // `none` (typed, pasted, bookmark, reload, back/forward) or no metadata.
  // A reload of the page already showing in this browser is allowed.
  return currentPage !== pathname;
}
