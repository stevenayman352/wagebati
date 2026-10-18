"use client";

import { PLATFORM_MAX_BYTES, SAFE_UPLOAD_BYTES } from "@/lib/file-rules";

const IMAGE_MAX_DIM = 1280;
const IMAGE_JPEG_QUALITY = 0.75;
const IMAGE_TARGET_BYTES = 200 * 1024;
const IMAGE_MIN_QUALITY = 0.4;
const VIDEO_MAX_DIM = 720;
const VIDEO_FPS_CAP = 30;
const VIDEO_AUDIO_KBPS = 96;
const VIDEO_MIN_BITRATE_KBPS = 1;
const VIDEO_MAX_BITRATE_KBPS = 2200;
/**
 * No size floor for video any more. Storage rejects anything over 50 MB, so the
 * only question is whether the picked file already fits; skipping compression
 * for an under-limit file keeps quality intact and the upload instant.
 */
const VIDEO_MIN_BYTES_TO_COMPRESS = 0;

export type CompressProgress = {
  stage: "image" | "video" | "none";
  pct: number;
};

export async function compressImageFile(file: File, onProgress?: (p: CompressProgress) => void): Promise<File> {
  try {
    if (!("createImageBitmap" in window)) return file;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let blob: Blob | null = null;
    let quality = IMAGE_JPEG_QUALITY;
    while (blob === null || blob.size > IMAGE_TARGET_BYTES) {
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (quality <= IMAGE_MIN_QUALITY) break;
      quality = Math.max(IMAGE_MIN_QUALITY, quality - 0.1);
    }
    if (!blob) return file;

    const out = new Blob([blob], { type: "image/jpeg" });
    if (out.size >= file.size) return file;

    onProgress?.({ stage: "image", pct: 100 });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([out], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

type VideoResult = { file: File; skipped?: boolean };

function probeDurationSeconds(file: File, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };

    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => finish(0);
    setTimeout(() => finish(0), timeoutMs);
    el.src = url;
  });
}

/**
 * Picks a video bitrate that lands the encode under `targetBytes` for this
 * clip's length, so the result is bounded by arithmetic rather than by hope.
 * Screen recordings of a static screen compress extremely well, so even the
 * longest ones stay inside the platform cap.
 */
function planVideoBitrateKbps(durationSeconds: number, targetBytes: number): number {
  const audioBits = VIDEO_AUDIO_KBPS * 1000;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return VIDEO_MAX_BITRATE_KBPS;
  const budgetBits = targetBytes * 8 - audioBits * durationSeconds;
  const kbps = Math.floor(budgetBits / durationSeconds / 1000);
  if (!Number.isFinite(kbps)) return VIDEO_MAX_BITRATE_KBPS;
  return Math.max(VIDEO_MIN_BITRATE_KBPS, Math.min(VIDEO_MAX_BITRATE_KBPS, kbps));
}

/**
 * Transcodes a video in the browser with ffmpeg.wasm: H.264/AAC MP4 at up to
 * 720p / 30fps, with the bitrate derived from the clip duration so the encode
 * is guaranteed to fit under the storage ceiling.
 *
 * Audio is re-encoded to AAC rather than stream-copied. A `copy` of the source
 * track fails outright on the containers Android screen recorders produce,
 * which used to throw and fall through to the untouched original file.
 *
 * The ffmpeg instance is always terminated. Leaving a 30 MB wasm core plus a
 * decoded frame buffer alive made each later attempt in the same page more
 * likely to run out of memory, so the failure appeared intermittently.
 */
export async function compressVideoFile(file: File, onProgress?: (p: CompressProgress) => void): Promise<VideoResult> {
  if (file.size < VIDEO_MIN_BYTES_TO_COMPRESS) return { file, skipped: true };

  const ffmpegRef = { current: null as { terminate: () => void } | null };

  try {
    const duration = await probeDurationSeconds(file);

    const [{ FFmpeg }, { fetchFile }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util")
    ]);

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;
    ffmpeg.on("progress", ({ progress }) => {
      const pct = Math.max(0, Math.min(1, progress));
      onProgress?.({ stage: "video", pct: Math.round(pct * 100) });
    });

    const base = `${location.origin}/ffmpeg`;
    await ffmpeg.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      classWorkerURL: `${base}/ffmpeg-worker.js`
    });

    const inputName = "input";
    const outputName = "output.mp4";
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const encode = async (bitrateKbps: number): Promise<Blob | null> => {
      const ret = await ffmpeg.exec([
        "-i", inputName,
        "-c:a", "aac",
        "-b:a", `${VIDEO_AUDIO_KBPS}k`,
        "-ac", "2",
        "-c:v", "libx264",
        "-profile:v", "main",
        "-preset", "ultrafast",
        "-b:v", `${bitrateKbps}k`,
        "-maxrate", `${bitrateKbps}k`,
        "-bufsize", `${bitrateKbps * 2}k`,
        "-vf", `scale=min(${VIDEO_MAX_DIM},iw):-2`,
        "-r", String(VIDEO_FPS_CAP),
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        outputName
      ]);
      if (ret !== 0) return null;
      const data = await ffmpeg.readFile(outputName);
      return new Blob([new Uint8Array(data as Uint8Array<ArrayBufferLike>)], { type: "video/mp4" });
    };

    let blob = await encode(planVideoBitrateKbps(duration, SAFE_UPLOAD_BYTES));

    // A first pass that overshot gets one more attempt at a lower bitrate
    // rather than being handed back oversized.
    if (blob && blob.size > PLATFORM_MAX_BYTES) {
      await ffmpeg.deleteFile(outputName).catch(() => {});
      const retryKbps = Math.floor(planVideoBitrateKbps(duration, SAFE_UPLOAD_BYTES) * 0.6);
      blob = await encode(Math.max(VIDEO_MIN_BITRATE_KBPS, retryKbps));
    }

    await ffmpeg.deleteFile(inputName).catch(() => {});

    if (!blob || blob.size >= file.size) return { file, skipped: true };

    onProgress?.({ stage: "video", pct: 100 });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
    return { file: new File([blob], `${baseName}.mp4`, { type: "video/mp4", lastModified: Date.now() }) };
  } catch {
    return { file, skipped: true };
  } finally {
    try {
      ffmpegRef.current?.terminate();
    } catch {
      /* already gone */
    }
  }
}
