"use client";

const IMAGE_MAX_DIM = 1280;
const IMAGE_JPEG_QUALITY = 0.75;
const IMAGE_TARGET_BYTES = 200 * 1024;
const IMAGE_MIN_QUALITY = 0.4;
const VIDEO_MAX_DIM = 720;
const VIDEO_CRF = "28";
const VIDEO_FPS_CAP = 30;
const VIDEO_MIN_BYTES_TO_COMPRESS = 8 * 1024 * 1024;

export type CompressProgress = {
  stage: "image" | "video" | "none";
  pct: number;
};

/**
 * Compress an image in the browser using createImageBitmap + OffscreenCanvas.
 * Resizes the longest edge to IMAGE_MAX_DIM and re-encodes as JPEG.
 * Falls back to the original file if the browser cannot decode it.
 */
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

/**
 * Compress a video with ffmpeg.wasm: H.264 MP4, capped at 720p / 30fps,
 * CRF 28. Runs entirely in the browser (Web Worker). Only kicks in when the
 * source is meaningfully large, and falls back to the original file on any
 * error so uploads never break.
 */
export async function compressVideoFile(file: File, onProgress?: (p: CompressProgress) => void): Promise<VideoResult> {
  if (file.size < VIDEO_MIN_BYTES_TO_COMPRESS || file.type === "" ) {
    return { file, skipped: true };
  }

  try {
    const [{ FFmpeg }, { fetchFile }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util")
    ]);

    const ffmpeg = new FFmpeg();
    let lastPct = 0;
    ffmpeg.on("progress", ({ progress }) => {
      lastPct = Math.max(0, Math.min(1, progress));
      onProgress?.({ stage: "video", pct: Math.round(lastPct * 100) });
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

    const args = [
      "-i", inputName,
      "-c:a", "copy",
      "-c:v", "libx264",
      "-profile:v", "main",
      "-preset", "veryfast",
      "-crf", VIDEO_CRF,
      "-vf", `scale=min(${VIDEO_MAX_DIM},iw):-2`,
      "-r", String(VIDEO_FPS_CAP),
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      outputName
    ];

    const ret = await ffmpeg.exec(args);
    if (ret !== 0) throw new Error(`ffmpeg exit code ${ret}`);

    const data = await ffmpeg.readFile(outputName);
    const bytes = new Uint8Array(data as Uint8Array<ArrayBufferLike>);
    const out = new Blob([bytes], { type: "video/mp4" });

    ffmpeg.terminate();

    if (out.size >= file.size) return { file, skipped: true };

    onProgress?.({ stage: "video", pct: 100 });
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return { file: new File([out], `${baseName}.mp4`, { type: "video/mp4", lastModified: Date.now() }) };
  } catch {
    return { file, skipped: true };
  }
}