import { describe, it, expect } from "vitest";
import {
  isBrowserDocumentNavigation,
  isProtectedAppPath,
  shouldRedirectToLogin
} from "@/lib/navigation-guard";

const h = (init: Record<string, string>) => new Headers(init);

const documentLoad = (site: string) =>
  h({ "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": site });

describe("isProtectedAppPath", () => {
  it("matches every role dashboard and app page", () => {
    expect(isProtectedAppPath("/admin")).toBe(true);
    expect(isProtectedAppPath("/admin/accounts")).toBe(true);
    expect(isProtectedAppPath("/teacher/classes/1/students/2")).toBe(true);
    expect(isProtectedAppPath("/student/assignments/1")).toBe(true);
    expect(isProtectedAppPath("/notifications")).toBe(true);
    expect(isProtectedAppPath("/preview")).toBe(true);
    expect(isProtectedAppPath("/change-password")).toBe(true);
    expect(isProtectedAppPath("/support")).toBe(true);
    expect(isProtectedAppPath("/support/thread-id")).toBe(true);
  });

  it("leaves public and unrelated routes alone", () => {
    expect(isProtectedAppPath("/")).toBe(false);
    expect(isProtectedAppPath("/login")).toBe(false);
    expect(isProtectedAppPath("/api/export")).toBe(false);
    expect(isProtectedAppPath("/administrator")).toBe(false);
    expect(isProtectedAppPath("/teacherish")).toBe(false);
  });
});

describe("isBrowserDocumentNavigation", () => {
  it("recognises a browser page load", () => {
    expect(isBrowserDocumentNavigation("GET", documentLoad("none"))).toBe(true);
  });

  it("ignores router RSC fetches", () => {
    expect(
      isBrowserDocumentNavigation("GET", h({ "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }))
    ).toBe(false);
  });

  it("ignores Server Actions", () => {
    expect(isBrowserDocumentNavigation("POST", documentLoad("same-origin"))).toBe(false);
  });

  it("falls back to Accept when Fetch Metadata is missing", () => {
    expect(
      isBrowserDocumentNavigation("GET", h({ accept: "text/html,application/xhtml+xml" }))
    ).toBe(true);
    expect(isBrowserDocumentNavigation("GET", h({ accept: "*/*" }))).toBe(false);
  });
});

describe("shouldRedirectToLogin", () => {
  const base = { method: "GET", pathname: "/admin", currentPage: null };

  it("redirects a typed/pasted URL", () => {
    expect(
      shouldRedirectToLogin({ ...base, headers: documentLoad("none"), currentPage: "/teacher" })
    ).toBe(true);
    expect(shouldRedirectToLogin({ ...base, headers: documentLoad("none") })).toBe(true);
  });

  it("allows reloading the page already open", () => {
    expect(
      shouldRedirectToLogin({ ...base, headers: documentLoad("none"), currentPage: "/admin" })
    ).toBe(false);
  });

  it("allows in-app link clicks and same-origin redirects", () => {
    expect(
      shouldRedirectToLogin({
        ...base,
        pathname: "/student",
        headers: documentLoad("same-origin"),
        currentPage: "/admin"
      })
    ).toBe(false);
  });

  it("redirects links opened from another site", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(
        shouldRedirectToLogin({ ...base, headers: documentLoad(site), currentPage: "/admin" })
      ).toBe(true);
    }
  });

  it("never touches client-side navigations", () => {
    expect(
      shouldRedirectToLogin({
        ...base,
        headers: h({ "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" })
      })
    ).toBe(false);
  });

  it("never touches Server Actions", () => {
    expect(
      shouldRedirectToLogin({
        ...base,
        method: "POST",
        headers: documentLoad("same-origin")
      })
    ).toBe(false);
  });

  it("leaves public routes reachable by URL", () => {
    for (const pathname of ["/", "/login", "/api/export"]) {
      expect(
        shouldRedirectToLogin({ ...base, pathname, headers: documentLoad("none") })
      ).toBe(false);
    }
  });
});
