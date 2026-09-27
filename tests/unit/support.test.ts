import { describe, it, expect } from "vitest";
import {
  generateSupportToken,
  hashSupportToken,
  isSupportMediaPathForThread,
  supportMediaPrefix,
  supportTokensMatch
} from "@/lib/support/token";
import { toThreadMessage, escapeLikePattern } from "@/lib/support/message";
import {
  guestThreadHref,
  parseGuestThreadPointer,
  serializeGuestThreadPointer
} from "@/lib/support/guest-session";
import { roleInitial, roleLabel } from "@/components/conversation-thread";
import { guestThreadSchema, supportGuestTokenSchema } from "@/lib/validators";

const THREAD = "3f1b9c2e-7a44-4f0e-9c1a-2b8d5e6f7a01";

describe("support tokens", () => {
  it("generates 32 bytes of entropy as base64url", () => {
    const a = generateSupportToken();
    const b = generateSupportToken();
    // 32 bytes -> 43 base64url characters, unpadded.
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically to 64 hex chars", () => {
    const token = generateSupportToken();
    const hash = hashSupportToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSupportToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("matches a token against its own digest", () => {
    const token = generateSupportToken();
    expect(supportTokensMatch(hashSupportToken(token), hashSupportToken(token))).toBe(true);
  });

  it("rejects a different token", () => {
    const stored = hashSupportToken(generateSupportToken());
    const other = hashSupportToken(generateSupportToken());
    expect(supportTokensMatch(stored, other)).toBe(false);
  });

  it("rejects malformed digests instead of truncating them", () => {
    const hash = hashSupportToken("abc");
    // Buffer.from(x, "hex") stops at the first invalid character, so a shape check
    // has to come first or these could compare equal by accident.
    expect(supportTokensMatch(hash, "zz")).toBe(false);
    expect(supportTokensMatch(hash, "ab")).toBe(false);
    expect(supportTokensMatch(null, hash)).toBe(false);
    expect(supportTokensMatch(hash, undefined)).toBe(false);
    expect(supportTokensMatch("", "")).toBe(false);
  });
});

describe("support media paths", () => {
  it("builds the thread-scoped prefix", () => {
    expect(supportMediaPrefix(THREAD)).toBe(`support-media/${THREAD}/`);
  });

  it("accepts a path inside the thread's own prefix", () => {
    expect(isSupportMediaPathForThread(`support-media/${THREAD}/abc-123.mp4`, THREAD)).toBe(true);
  });

  it("rejects a path belonging to another thread", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(isSupportMediaPathForThread(`support-media/${other}/abc.mp4`, THREAD)).toBe(false);
  });

  it("rejects traversal, absolute paths, and nesting", () => {
    expect(isSupportMediaPathForThread(`support-media/${THREAD}/../../admin/x.png`, THREAD)).toBe(false);
    expect(isSupportMediaPathForThread(`/support-media/${THREAD}/x.png`, THREAD)).toBe(false);
    expect(isSupportMediaPathForThread(`support-media/${THREAD}/nested/x.png`, THREAD)).toBe(false);
    expect(isSupportMediaPathForThread(`support-media/${THREAD}/`, THREAD)).toBe(false);
    expect(isSupportMediaPathForThread(null, THREAD)).toBe(false);
  });

  it("rejects a prefix that merely starts with the same characters", () => {
    expect(isSupportMediaPathForThread(`support-media/${THREAD}x/abc.png`, THREAD)).toBe(false);
  });
});

describe("toThreadMessage", () => {
  const row = {
    id: "m1",
    author_profile_id: "admin-uuid",
    author_kind: "admin",
    guest_name: "زائر",
    kind: "text",
    body: "أهلاً",
    storage_path: null,
    file_name: null,
    mime_type: null,
    file_size: null,
    duration_seconds: null,
    reply_to_message_id: null,
    created_at: "2026-09-26T10:00:00.000Z"
  };

  it("aliases author columns onto the shared thread shape", () => {
    const m = toThreadMessage(row, "admin-uuid");
    expect(m.sender_id).toBe("admin-uuid");
    expect(m.sender_role).toBe("admin");
    expect(m.deleted_from_storage_at).toBeNull();
    // Support has no storage-cleanup state, so the field stays null.
    expect(m.display_name).toBe("زائر");
  });

  it("falls back safely on a realtime payload with missing columns", () => {
    const m = toThreadMessage({ id: "m2" }, "admin-uuid");
    expect(m.id).toBe("m2");
    expect(m.kind).toBe("text");
    expect(m.body).toBe("");
    expect(m.created_at).toBeTruthy();
  });

  it("treats a null author as the guest only when guestId is supplied", () => {
    const guestRow = { ...row, author_profile_id: null, author_kind: "guest" };
    // Guest view: the null author is this guest, so it renders as outgoing.
    expect(toThreadMessage(guestRow, "guest:hash", "guest:hash").sender_id).toBe("guest:hash");
    // Admin view: no guestId, so it must NOT resolve to the admin's own id,
    // otherwise every guest message would render as a right-aligned bubble.
    expect(toThreadMessage(guestRow, "admin-uuid").sender_id).toBe("");
  });
});

describe("support role labels", () => {
  it("maps every role the support tables allow", () => {
    expect(roleLabel("admin")).toBe("الدعم");
    expect(roleLabel("student")).toBe("الطالب");
    expect(roleLabel("guest")).toBe("زائر");
    expect(roleLabel("teacher")).toBe("المدرس");
  });

  it("has an initial for every role", () => {
    expect(roleInitial("guest")).toBe("ز");
    expect(roleInitial("admin")).toBe("د");
    expect(roleInitial("teacher")).toBe("م");
    expect(roleInitial("student")).toBe("ط");
  });

  it("degrades gracefully on an unknown role", () => {
    expect(roleInitial("nobody")).toBe("؟");
    expect(roleLabel("nobody")).toBe("مستخدم");
  });
});

describe("guestThreadSchema", () => {
  const base = { guestName: "محمد", guestCode: "AB12", body: "محتاج مساعدة" };

  it("accepts a well-formed request", () => {
    expect(guestThreadSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty honeypot violation only when it is filled", () => {
    expect(guestThreadSchema.safeParse({ ...base, website: "" }).success).toBe(true);
    expect(guestThreadSchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
  });

  it("requires a name, a code, and a message", () => {
    expect(guestThreadSchema.safeParse({ ...base, guestName: "" }).success).toBe(false);
    expect(guestThreadSchema.safeParse({ ...base, guestCode: "" }).success).toBe(false);
    expect(guestThreadSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
  });

  it("accepts any non-empty code, since codes are never validated", () => {
    // The code is free text: it is not looked up against `profiles`.
    expect(guestThreadSchema.safeParse({ ...base, guestCode: "مش موجود" }).success).toBe(true);
    expect(guestThreadSchema.safeParse({ ...base, guestCode: "x".repeat(60) }).success).toBe(true);
    expect(guestThreadSchema.safeParse({ ...base, guestCode: "x".repeat(61) }).success).toBe(false);
  });
});

describe("supportGuestTokenSchema", () => {
  it("requires a uuid thread id and a real-length token", () => {
    expect(supportGuestTokenSchema.safeParse({ threadId: THREAD, token: "a".repeat(43) }).success).toBe(true);
    expect(supportGuestTokenSchema.safeParse({ threadId: "not-a-uuid", token: "a".repeat(43) }).success).toBe(false);
    expect(supportGuestTokenSchema.safeParse({ threadId: THREAD, token: "short" }).success).toBe(false);
  });
});

describe("support inbox search", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    // Without escaping, a search for "50%" would match any string starting with
    // "50" and any string containing a lone % would behave the same way.
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary search text untouched", () => {
    expect(escapeLikePattern("2340")).toBe("2340");
    expect(escapeLikePattern("مينا")).toBe("مينا");
    expect(escapeLikePattern("hello world")).toBe("hello world");
  });

  it("produces a wrap pattern that keeps the needle whole", () => {
    expect(`%${escapeLikePattern("a%b")}%`).toBe("%a\\%b%");
  });
});

describe("guest thread pointer cookie", () => {
  const token = generateSupportToken();

  it("round-trips a serialized pointer", () => {
    const raw = serializeGuestThreadPointer(THREAD, token);
    expect(parseGuestThreadPointer(raw)).toEqual({ threadId: THREAD, token });
  });

  it("builds a resume href that carries the token as the credential", () => {
    const href = guestThreadHref(THREAD, token);
    expect(href).toBe(`/support/${THREAD}?k=${encodeURIComponent(token)}`);
  });

  it("rejects malformed cookies instead of throwing", () => {
    // A hand-edited cookie must degrade to "no saved thread", never an error page.
    for (const raw of [
      undefined,
      null,
      "",
      ".",
      "no-dot-at-all",
      `${THREAD}.`,
      `.${token}`,
      "not-a-uuid." + token,
      `${THREAD}.short`,
      // A token of the right length but with characters outside base64url.
      `${THREAD}.${"a".repeat(42)}+`,
      // Dots are the separator and appear in neither half, so a second dot is junk.
      `${THREAD}.${token}.${token}`
    ]) {
      expect(parseGuestThreadPointer(raw)).toBeNull();
    }
  });
});
