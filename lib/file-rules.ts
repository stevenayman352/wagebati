/**
 * Storage here is Supabase-backed, and the platform enforces a hard 50 MB
 * ceiling on a single object no matter what `file_size_limit` a bucket
 * reports. Measured: 50 MB uploads, 51 MB fails with
 * "The object exceeded the maximum allowed size". Bucket settings above that
 * number are decorative, so every limit in this file is derived from the real
 * platform ceiling rather than from what a bucket claims.
 */

/**
 * No hard size ceiling for a single stored video object any more: videos are
 * transcoded in the browser to fit under `SAFE_UPLOAD_BYTES`, so the original
 * input can be any size. Kept as `Infinity` so legacy callers that compare
 * against it never reject a file. Storage still applies its own limit, but the
 * client no longer enforces one and compresses instead.
 */
export const PLATFORM_MAX_BYTES = Infinity;

/**
 * Ceiling that client-side transcoding aims for. Leaves headroom under the
 * platform cap so rounding and container overhead can never tip an upload over.
 */
export const SAFE_UPLOAD_BYTES = 44 * 1024 * 1024;

/**
 * MIME types storage will accept on the video buckets. Anything outside this
 * list is transcoded to MP4 in the browser first, which is also what keeps
 * playback working across devices.
 */
export const UPLOADABLE_VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;

/** Container formats we accept to read. All are transcoded to MP4 before upload. */
const READABLE_VIDEO_MIMES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "video/3gpp2",
  "video/x-matroska",
  "video/x-msvideo",
  "video/x-m4v",
  "video/mpeg",
  "video/ogg"
];

/** Extension fallback for platforms that hand us a file with no MIME type. */
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|qt|webm|3gp|3g2|mkv|avi|mpg|mpeg|ogv)$/i;

export type AcceptableKind = "video" | "image" | "voice";

export const MIME_LIMITS: Record<AcceptableKind, { mimes: readonly string[]; maxBytes: number }> = {
  video: {
    mimes: READABLE_VIDEO_MIMES,
    maxBytes: Infinity
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

export const MAX_UPLOAD_BYTES = PLATFORM_MAX_BYTES;

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

/**
 * Whether a picked file is a video we can work with. Falls back to the file
 * extension because some Android screen recorders and file pickers hand over a
 * Blob with an empty or generic `type`.
 */
export function isReadableVideo(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (READABLE_VIDEO_MIMES.includes(mime)) return true;
  if (mime === "" && VIDEO_EXTENSIONS.test(file.name)) return true;
  return false;
}

/** Whether a file should be transcoded. Now true for every readable video so any
 *  input, regardless of size or container, is run through the compressor. */
export function needsVideoProcessing(file: File): boolean {
  return isReadableVideo(file);
}

/** The MIME type a video should be stored under once it has been transcoded. */
export function videoUploadMime(file: File): string {
  return (UPLOADABLE_VIDEO_MIMES as readonly string[]).includes((file.type || "").toLowerCase())
    ? file.type
    : "video/mp4";
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
