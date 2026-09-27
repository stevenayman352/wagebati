import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supportMediaPrefix } from "@/lib/support/token";

/**
 * The `support-media` bucket is private, and every *read* goes through the
 * service role, which sidesteps object-level RLS entirely.
 *
 * Writes take one of two routes, because the two audiences do not have the same
 * credentials available:
 *   - Guests have no session, so they are handed a signed upload target by
 *     `createSupportUploadTicket` below and push bytes directly to storage.
 *   - Signed-in students and admins upload with their own access token, which
 *     means RLS applies and the migration must grant them an insert policy on
 *     `support-media`. Reads stay service-role, so there is deliberately no
 *     select policy.
 *
 * The bucket allows the same MIME set as `message-media`, so the existing
 * `lib/file-rules.ts` limits apply unchanged to support media.
 */

export const SUPPORT_BUCKET = "support-media";

const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Batches paths into a path -> signed URL map for a message list. One call for
 * the whole page instead of N.
 */
export async function signSupportMedia(
  paths: (string | null | undefined)[]
): Promise<Record<string, string | null>> {
  const clean = Array.from(
    new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0))
  );
  if (!clean.length) return {};

  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrls(clean, SIGNED_URL_TTL_SECONDS);

  const byPath = new Map((data ?? []).map((u) => [u.path, u.signedUrl ?? null]));
  const out: Record<string, string | null> = {};
  for (const p of clean) out[p] = byPath.get(p) ?? null;
  return out;
}

export type SupportUploadTicket = {
  path: string;
  signedUrl: string;
  token: string;
};

/**
 * Issues a one-time signed upload target so a guest can push a file straight to
 * storage without a session.
 *
 * The existing `uploadWithProgress` helper cannot serve guests: it reads a
 * session access token and hard-rejects without one. A signed upload URL is the
 * Supabase-native answer to that — the server authorizes the guest once, hands
 * back a scoped target, and the file goes browser -> storage directly, so large
 * videos never pass through the Next server. Compression and progress reporting
 * stay client-side.
 *
 * The caller must have already authenticated the guest against the thread's
 * capability token; this only decides *where* the bytes may land.
 */
export async function createSupportUploadTicket(
  threadId: string,
  extension: string
): Promise<SupportUploadTicket | null> {
  const ext = extension.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const path = `${supportMediaPrefix(threadId)}${crypto.randomUUID()}.${ext}`;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(SUPPORT_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data.token) return null;

  return { path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Best-effort removal of a set of object keys. Used when a thread is deleted or
 * purged. Never throws.
 */
export async function removeSupportMedia(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from(SUPPORT_BUCKET).remove(paths);
    if (error) console.error("[support] failed to remove media:", error.message);
  } catch (error) {
    console.error("[support] media removal failed:", error);
  }
}
