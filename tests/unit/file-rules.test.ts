import { describe, it, expect } from "vitest";
import {
  messageKindFromMime,
  validateUploadFile,
  maxBytesFor,
  allowedMimeFor,
  MIME_LIMITS,
  PLATFORM_MAX_BYTES,
  SAFE_UPLOAD_BYTES,
  UPLOADABLE_VIDEO_MIMES,
  isReadableVideo,
  needsVideoProcessing,
  videoUploadMime
} from "@/lib/file-rules";

function fakeFile(type: string, size: number, name = "clip.mp4"): File {
  return { type, size, name } as File;
}

describe("platform ceiling", () => {
  it("has no client-side ceiling (videos are compressed instead)", () => {
    expect(PLATFORM_MAX_BYTES).toBe(Infinity);
  });

  it("leaves headroom under the ceiling for compressed output", () => {
    expect(SAFE_UPLOAD_BYTES).toBeLessThan(PLATFORM_MAX_BYTES);
  });

  it("only stores MP4/MOV, which is what transcode emits", () => {
    expect(UPLOADABLE_VIDEO_MIMES).toEqual(["video/mp4", "video/quicktime"]);
  });
});

describe("MIME_LIMITS / per-kind limits", () => {
  it("caps video at the real platform ceiling, not an aspirational 5GB", () => {
    expect(MIME_LIMITS.video.maxBytes).toBe(PLATFORM_MAX_BYTES);
  });

  it("reads the container formats students actually record in", () => {
    expect(MIME_LIMITS.video.mimes).toContain("video/mp4");
    expect(MIME_LIMITS.video.mimes).toContain("video/webm");
    expect(MIME_LIMITS.video.mimes).toContain("video/3gpp");
    expect(MIME_LIMITS.video.mimes).toContain("video/x-matroska");
  });

  it("enforces image JPG/JPEG/PNG/WebP up to 10MB", () => {
    expect(MIME_LIMITS.image.mimes).toContain("image/jpeg");
    expect(MIME_LIMITS.image.mimes).toContain("image/png");
    expect(MIME_LIMITS.image.mimes).toContain("image/webp");
    expect(MIME_LIMITS.image.maxBytes).toBe(10 * 1024 * 1024);
  });

  it("enforces voice MP3 up to 10MB", () => {
    expect(MIME_LIMITS.voice.mimes).toEqual(["audio/mpeg"]);
    expect(MIME_LIMITS.voice.maxBytes).toBe(10 * 1024 * 1024);
  });
});

describe("messageKindFromMime", () => {
  it("maps video mimes", () => {
    expect(messageKindFromMime("video/mp4")).toBe("video");
    expect(messageKindFromMime("video/quicktime")).toBe("video");
    expect(messageKindFromMime("video/3gpp")).toBe("video");
  });

  it("maps image mimes", () => {
    expect(messageKindFromMime("image/jpeg")).toBe("image");
    expect(messageKindFromMime("image/png")).toBe("image");
    expect(messageKindFromMime("image/webp")).toBe("image");
  });

  it("maps voice mimes", () => {
    expect(messageKindFromMime("audio/mpeg")).toBe("voice");
  });

  it("rejects unsupported mimes", () => {
    expect(messageKindFromMime("application/pdf")).toBeNull();
    expect(messageKindFromMime("text/html")).toBeNull();
    expect(messageKindFromMime("")).toBeNull();
  });
});

describe("isReadableVideo", () => {
  it("accepts the containers screen recorders produce", () => {
    expect(isReadableVideo(fakeFile("video/mp4", 1000))).toBe(true);
    expect(isReadableVideo(fakeFile("video/webm", 1000))).toBe(true);
    expect(isReadableVideo(fakeFile("video/3gpp", 1000))).toBe(true);
    expect(isReadableVideo(fakeFile("video/x-matroska", 1000))).toBe(true);
  });

  it("falls back to the extension when the picker reports no MIME type", () => {
    expect(isReadableVideo(fakeFile("", 1000, "screen-record-2026.mp4"))).toBe(true);
    expect(isReadableVideo(fakeFile("", 1000, "recording.3gp"))).toBe(true);
  });

  it("still rejects files that are not video at all", () => {
    expect(isReadableVideo(fakeFile("image/png", 1000, "shot.png"))).toBe(false);
    expect(isReadableVideo(fakeFile("application/pdf", 1000, "doc.pdf"))).toBe(false);
  });
});

describe("needsVideoProcessing", () => {
  it("compresses anything over the platform ceiling", () => {
    expect(needsVideoProcessing(fakeFile("video/mp4", PLATFORM_MAX_BYTES + 1))).toBe(true);
  });

  it("compresses a 1-minute screen recording that is over the ceiling", () => {
    expect(needsVideoProcessing(fakeFile("video/mp4", 60 * 1024 * 1024))).toBe(true);
  });

  it("compresses formats storage would reject, even when small", () => {
    expect(needsVideoProcessing(fakeFile("video/webm", 5 * 1024 * 1024))).toBe(true);
  });

  it("compresses every readable video, including a small MP4", () => {
    expect(needsVideoProcessing(fakeFile("video/mp4", 5 * 1024 * 1024))).toBe(true);
  });
});

describe("videoUploadMime", () => {
  it("keeps an already-storable type", () => {
    expect(videoUploadMime(fakeFile("video/mp4", 1000))).toBe("video/mp4");
    expect(videoUploadMime(fakeFile("video/quicktime", 1000))).toBe("video/quicktime");
  });

  it("renames anything else to mp4 for storage", () => {
    expect(videoUploadMime(fakeFile("video/webm", 1000))).toBe("video/mp4");
    expect(videoUploadMime(fakeFile("", 1000, "rec.mkv"))).toBe("video/mp4");
  });
});

describe("validateUploadFile", () => {
  it("accepts a supported, in-size file", () => {
    const res = validateUploadFile(fakeFile("video/mp4", 1024));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.kind).toBe("video");
  });

  it("accepts a video right up to the platform ceiling", () => {
    expect(validateUploadFile(fakeFile("video/mp4", PLATFORM_MAX_BYTES)).ok).toBe(true);
  });

  it("accepts a video of any size", () => {
    const res = validateUploadFile(fakeFile("video/mp4", 10 * 1024 * 1024 * 1024));
    expect(res.ok).toBe(true);
  });

  it("rejects an image over 10MB even though video allows the ceiling", () => {
    expect(validateUploadFile(fakeFile("image/png", 11 * 1024 * 1024)).ok).toBe(false);
  });

  it("rejects a 100MB file that is an image (per-kind cap, no single global cap)", () => {
    expect(validateUploadFile(fakeFile("image/jpeg", 100 * 1024 * 1024)).ok).toBe(false);
  });

  it("rejects unsupported type with Arabic message", () => {
    const res = validateUploadFile(fakeFile("application/x-msdownload", 1024));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("نوع الملف غير مسموح.");
  });
});

describe("helpers", () => {
  it("returns accept string and max bytes per kind", () => {
    expect(maxBytesFor("video")).toBe(PLATFORM_MAX_BYTES);
    expect(maxBytesFor("voice")).toBe(10 * 1024 * 1024);
    expect(allowedMimeFor("image")).toContain("image/jpeg");
  });

  it("offers every readable video format to the file picker", () => {
    const accept = allowedMimeFor("video");
    expect(accept).toContain("video/mp4");
    expect(accept).toContain("video/webm");
    expect(accept).toContain("video/3gpp");
  });
});
