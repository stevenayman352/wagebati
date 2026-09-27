import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Guest capability tokens.
 *
 * A guest thread is reachable without a session, so possession of the token is
 * the authorization. Everything here is pure and synchronous so the security
 * surface can be unit-tested directly.
 */

export const SUPPORT_TOKEN_BYTES = 32;

const HEX64 = /^[0-9a-f]{64}$/;

export function generateSupportToken(): string {
  return randomBytes(SUPPORT_TOKEN_BYTES).toString("base64url");
}

export function hashSupportToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Guards on shape first because
 * `Buffer.from(x, "hex")` silently truncates at the first invalid character,
 * which would otherwise turn a malformed value into a false "match".
 */
export function supportTokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !HEX64.test(a) || !HEX64.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Storage keys follow the existing `message-media/{conversationId}/{uuid}.ext`
 * convention, so the bucket name is part of the object key.
 */
export function supportMediaPrefix(threadId: string): string {
  return `support-media/${threadId}/`;
}

/**
 * A client reports `storagePath` back when posting a message. Without this check
 * a guest could claim a path belonging to a different thread, or one that was
 * never uploaded at all. Paths are generated server-side in
 * `createSupportUploadTicket`, so this only has to reject anything that is not
 * strictly inside this thread's own prefix.
 */
export function isSupportMediaPathForThread(path: string | null | undefined, threadId: string): boolean {
  if (!path) return false;
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  if (!path.startsWith(supportMediaPrefix(threadId))) return false;
  const name = path.slice(supportMediaPrefix(threadId).length);
  return name.length > 0 && !name.includes("/");
}
