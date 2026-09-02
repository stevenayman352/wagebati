export type AcceptableKind = "video" | "image" | "voice";

export const MIME_LIMITS: Record<AcceptableKind, { mimes: readonly string[]; maxBytes: number }> = {
  video: {
    mimes: ["video/mp4", "video/quicktime"],
    maxBytes: 250 * 1024 * 1024
  },
  image: {
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024
  },
  voice: {
    mimes: ["audio/mpeg"],
    maxBytes: 10 * 1024 * 1024
  }
};

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export const allowedMimeTypes = {
  video: MIME_LIMITS.video.mimes,
  image: MIME_LIMITS.image.mimes,
  voice: MIME_LIMITS.voice.mimes
} as const;

export function messageKindFromMime(mime: string): AcceptableKind | null {
  if (MIME_LIMITS.video.mimes.includes(mime)) return "video";
  if (MIME_LIMITS.image.mimes.includes(mime)) return "image";
  if (MIME_LIMITS.voice.mimes.includes(mime)) return "voice";
  return null;
}

export type ValidationResult =
  | { ok: true; kind: AcceptableKind }
  | { ok: false; message: string };

export function validateUploadFile(file: File): ValidationResult {
  const kind = messageKindFromMime(file.type);
  if (!kind) return { ok: false, message: "نوع الملف غير مسموح." };
  const limit = MIME_LIMITS[kind].maxBytes;
  if (file.size > limit) return { ok: false, message: "حجم الملف أكبر من الحد المسموح." };
  return { ok: true, kind };
}

export function allowedMimeFor(kind: AcceptableKind): string {
  return MIME_LIMITS[kind].mimes.join(",");
}

export function maxBytesFor(kind: AcceptableKind): number {
  return MIME_LIMITS[kind].maxBytes;
}
