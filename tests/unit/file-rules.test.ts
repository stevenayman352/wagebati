import { describe, it, expect } from "vitest";
import {
  messageKindFromMime,
  validateUploadFile,
  maxBytesFor,
  allowedMimeFor,
  MIME_LIMITS
} from "@/lib/file-rules";

function fakeFile(type: string, size: number): File {
  return { type, size } as File;
}

describe("MIME_LIMITS / per-kind limits", () => {
  it("enforces video MP4/MOV up to 250MB", () => {
    expect(MIME_LIMITS.video.mimes).toEqual(["video/mp4", "video/quicktime"]);
    expect(MIME_LIMITS.video.maxBytes).toBe(250 * 1024 * 1024);
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
  });

  it("rejects unsupported video variants (webm not allowed for submission)", () => {
    expect(messageKindFromMime("video/webm")).toBeNull();
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

describe("validateUploadFile", () => {
  it("accepts a supported, in-size file", () => {
    const res = validateUploadFile(fakeFile("video/mp4", 1024));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.kind).toBe("video");
  });

  it("accepts a video up to the 250MB limit", () => {
    const res = validateUploadFile(fakeFile("video/mp4", 250 * 1024 * 1024));
    expect(res.ok).toBe(true);
  });

  it("rejects a video over 250MB", () => {
    const res = validateUploadFile(fakeFile("video/mp4", 250 * 1024 * 1024 + 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("حجم الملف أكبر من الحد المسموح.");
  });

  it("rejects an image over 10MB even though video allows 250MB", () => {
    const res = validateUploadFile(fakeFile("image/png", 11 * 1024 * 1024));
    expect(res.ok).toBe(false);
  });

  it("rejects a 100MB file that is an image (per-kind cap, no single global cap)", () => {
    const res = validateUploadFile(fakeFile("image/jpeg", 100 * 1024 * 1024));
    expect(res.ok).toBe(false);
  });

  it("rejects unsupported type with Arabic message", () => {
    const res = validateUploadFile(fakeFile("application/x-msdownload", 1024));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("نوع الملف غير مسموح.");
  });
});

describe("helpers", () => {
  it("returns accept string and max bytes per kind", () => {
    expect(maxBytesFor("video")).toBe(250 * 1024 * 1024);
    expect(maxBytesFor("voice")).toBe(10 * 1024 * 1024);
    expect(allowedMimeFor("image")).toContain("image/jpeg");
  });
});
