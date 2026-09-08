"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

let active: { el: HTMLAudioElement; dispatch: (playing: boolean) => void } | null = null;

function formatVoiceTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({ src, mine }: { src: string; mine?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const a = new Audio();
    a.preload = "metadata";
    a.src = src;
    a.onloadedmetadata = () => {
      if (!disposed && Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    a.ontimeupdate = () => {
      if (!disposed) setElapsed(a.currentTime);
    };
    a.onplay = () => {
      if (!disposed) setPlaying(true);
    };
    a.onpause = () => {
      if (!disposed) setPlaying(false);
    };
    a.onended = () => {
      if (!disposed) setElapsed(0);
      if (active?.el === a) active = null;
    };
    audioRef.current = a;
    return () => {
      disposed = true;
      a.pause();
      a.removeAttribute("src");
      a.load();
      if (active?.el === a) active = null;
      audioRef.current = null;
    };
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playing) {
      a.pause();
      if (active?.el === a) active = null;
      return;
    }
    if (active && active.el !== a) {
      active.el.pause();
      active.dispatch(false);
    }
    active = { el: a, dispatch: setPlaying };
    a.currentTime = 0;
    setElapsed(0);
    setPlaying(true);
    void a.play().catch(() => setPlaying(false));
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setElapsed(a.currentTime);
  }

  function seekByKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !a || !Number.isFinite(a.duration)) return;
    e.preventDefault();
    a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
    setElapsed(a.currentTime);
  }

  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

  if (!src) {
    return (
      <div className="flex w-64 max-w-full items-center gap-2 text-xs opacity-80">
        <span className="size-8 shrink-0 animate-pulse rounded-full bg-foreground/10" />
        جارِ التحميل...
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex w-64 max-w-full items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
          mine ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
        )}
      >
        {playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-px fill-current" />
        )}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label="تقدم الصوت"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(elapsed)}
        onClick={seek}
        onKeyDown={seekByKey}
        className="relative h-8 flex-1 cursor-pointer touch-none"
      >
        <div
          className={cn(
            "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full",
            mine ? "bg-primary-foreground/25" : "bg-foreground/10"
          )}
        />
        <div
          className={cn(
            "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full",
            mine ? "bg-primary-foreground/90" : "bg-primary"
          )}
          style={{ left: 0, width: `${pct}%` }}
        />
      </div>

      <span
        className={cn(
          "w-10 shrink-0 text-end text-[0.7rem] font-semibold tabular-nums",
          mine ? "text-primary-foreground/80" : "text-muted-foreground"
        )}
      >
        {playing ? formatVoiceTime(elapsed) : formatVoiceTime(duration)}
      </span>
    </div>
  );
}