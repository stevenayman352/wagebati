"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mp3Encoder } from "@breezystack/lamejs";
import { Button } from "@/components/ui/button";
import { Check, Mic, Pause, Play, Square, Trash2, Send, X } from "lucide-react";

const MAX_SECONDS = 600;
const BIT_RATE = 128;

type Phase = "idle" | "recording" | "preview";

function floatTo16(pcm: Float32Array, out: Int16Array) {
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorder({
  onRecorded,
  onRecordingChange,
  disabled,
  uploading
}: {
  onRecorded: (file: File, durationSeconds: number) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  uploading?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<File | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const totalSamplesRef = useRef(0);
  const sampleRateRef = useRef(44100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      const ctx = ctxRef.current;
      const stream = streamRef.current;
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (ctx) void ctx.close();
      stream?.getTracks().forEach((t) => t.stop());
      stopPlaybackSound();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function stopPlaybackSound() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
      audioRef.current = null;
    }
    setPlaying(false);
    setPlaybackSeconds(0);
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("التسجيل غير مدعوم في هذا المتصفح.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const dest = ctx.createMediaStreamDestination();

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        totalSamplesRef.current += input.length;
        const int16 = new Int16Array(input.length);
        floatTo16(input, int16);
        chunksRef.current.push(int16);
      };

      source.connect(processor);
      processor.connect(dest);

      streamRef.current = stream;
      ctxRef.current = ctx;
      sourceRef.current = source;
      processorRef.current = processor;
      sampleRateRef.current = ctx.sampleRate;
      chunksRef.current = [];
      totalSamplesRef.current = 0;
      setSeconds(0);
      setPhase("recording");
      onRecordingChange?.(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            void stop();
            return s + 1;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "تم رفض إذن الميكروفون." : "تعذر الوصول إلى الميكروفون.");
    }
  }

  async function stop() {
    if (phase !== "recording") return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPhase("preview");
    onRecordingChange?.(false);
    setBusy(true);

    const ctx = ctxRef.current;
    const stream = streamRef.current;
    const chunks = chunksRef.current;
    const sampleRate = sampleRateRef.current;
    if (processorRef.current) processorRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    ctxRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;

    try {
      if (ctx) await ctx.close();
    } catch {
      /* ignore */
    }

    const total = totalSamplesRef.current;
    if (total < 1) {
      chunksRef.current = [];
      totalSamplesRef.current = 0;
      setPhase("idle");
      setBusy(false);
      setError("التسجيل فارغ.");
      return;
    }

    try {
      const encoder = new Mp3Encoder(1, sampleRate, BIT_RATE);
      const parts: Uint8Array[] = [];
      for (const chunk of chunks) {
        const encoded = encoder.encodeBuffer(chunk);
        if (encoded.length > 0) parts.push(new Uint8Array(encoded));
      }
      const flush = encoder.flush();
      if (flush.length > 0) parts.push(new Uint8Array(flush));

      const blob = new Blob(parts as unknown as BlobPart[], { type: "audio/mpeg" });
      const duration = Math.max(1, Math.round(total / sampleRate));
      const file = new File([blob], `recording-${Date.now()}.mp3`, { type: "audio/mpeg", lastModified: Date.now() });
      if (aliveRef.current) {
        setRecorded(file);
        setRecordedDuration(duration);
        setSeconds(duration);
        setPlaybackSeconds(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تشفير التسجيل.");
      setPhase("idle");
    } finally {
      chunksRef.current = [];
      totalSamplesRef.current = 0;
      setBusy(false);
    }
  }

  const playPreview = useCallback(() => {
    if (!recorded) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      audioRef.current = a;
    }
    if (!urlRef.current) {
      urlRef.current = URL.createObjectURL(recorded);
    }
    a.src = urlRef.current;
    a.currentTime = 0;
    a.play().catch(() => {
      setError("تعذر تشغيل المعاينة.");
    });
    a.ontimeupdate = () => setPlaybackSeconds(a?.currentTime ?? 0);
    a.onended = () => {
      setPlaying(false);
      setPlaybackSeconds(0);
    };
    setPlaying(true);
    setError(null);
  }, [recorded]);

  function pausePreview() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      setPlaying(false);
    }
  }

  function discard() {
    stopPlaybackSound();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setRecorded(null);
    setRecordedDuration(0);
    setSeconds(0);
    setPhase("idle");
    setError(null);
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void start()} disabled={disabled || busy}>
          <Mic className="h-4 w-4" /> {busy ? "جار التشفير..." : "تسجيل صوتي"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (phase === "recording") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="destructive" onClick={() => void stop()} disabled={busy}>
          <Square className="h-4 w-4" /> إيقاف
        </Button>
        {seconds > 0 ? <span className="text-sm tabular-nums text-destructive">{formatTime(seconds)}</span> : null}
        <span className="sr-only">جار التسجيل</span>
      </div>
    );
  }

  // Preview phase
  return (
    <div className="flex flex-wrap items-center gap-2">
      {uploading ? (
        <Button type="button" size="sm" variant="outline" disabled>
          <Check className="h-4 w-4" /> جار الإرسال...
        </Button>
      ) : (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => (playing ? pausePreview() : void playPreview())} disabled={busy}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "إيقاف" : "استمع"}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {playing ? formatTime(Math.floor(playbackSeconds)) : formatTime(recordedDuration)}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={discard} disabled={busy}>
            <Trash2 className="h-4 w-4" /> حذف
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !recorded}
            onClick={() => {
              if (!recorded) return;
              pausePreview();
              setPhase("idle");
              setRecorded(null);
              onRecorded(recorded, recordedDuration);
            }}
          >
            <Send className="h-4 w-4" /> إرسال
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={busy}>
        <X className="h-4 w-4" />
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
