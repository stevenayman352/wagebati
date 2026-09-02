"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

async function downloadFile(url: string, name: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name || "message";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function Player({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  function skip(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), Number.isFinite(v.duration) ? v.duration : Infinity);
    setCurrent(v.currentTime);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          src={src}
          playsInline
          className="max-h-full max-w-full"
          onClick={togglePlay}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>

      <div dir="ltr" className="flex items-center gap-3 px-4 pb-3 pt-4 text-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => skip(-10)}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            aria-label="الرجوع 10 ثوانٍ"
          >
            <RotateCcw className="size-5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex size-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-transform hover:scale-105"
            aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-[1px] rtl:-translate-x-[1px]" />}
          </button>
          <button
            type="button"
            onClick={() => skip(10)}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            aria-label="تقديم 10 ثوانٍ"
          >
            <RotateCw className="size-5" />
          </button>
        </div>

        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration)}
            onChange={(e) => {
              const v = videoRef.current;
              const next = Number(e.target.value);
              if (v) v.currentTime = next;
              setCurrent(next);
            }}
            className="h-1.5 w-full cursor-pointer accent-[oklch(0.7_0.16_262)]"
            aria-label="شريط التقدم"
          />
        </div>

        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {fmtTime(current)} / {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}

export function MediaViewer({
  kind,
  src,
  fileName,
  onClose
}: {
  kind: "image" | "video";
  src: string;
  fileName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
<div
        className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm animate-pop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={kind === "video" ? "عارض الفيديو" : "عارض الصورة"}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="رجوع"
        >
          <ArrowRight className="size-5 rtl:-scale-x-100" />
        </button>
        <button
          type="button"
          onClick={() => void downloadFile(src, fileName)}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="تحميل الملف"
        >
          <Download className="size-5" />
        </button>
      </div>

      {kind === "image" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={fileName ?? "صورة"} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Player src={src} />
        </div>
      )}
    </div>
  );
}