"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, VideoIcon, History } from "lucide-react";

type SubmissionImage = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  sort_number: number;
};

export type Submission = {
  id: string;
  attempt_number: number;
  video_path: string | null;
  video_name: string | null;
  voice_path: string | null;
  voice_name: string | null;
  submitted_at: string;
  submission_images?: SubmissionImage[] | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export function SubmissionHistory({
  submissions,
  urls
}: {
  submissions: Submission[];
  urls: Record<string, string | null>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs">
          <History className="size-3.5" />
          محاولاتك ({submissions.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>محاولاتك ({submissions.length})</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-lg)] border border-border/70 bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-xs font-extrabold">{s.attempt_number}</span>
                  محاولة {s.attempt_number}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(s.submitted_at)}</span>
              </div>
              {s.video_path ? (
                <video controls src={urls[`video-${s.id}`] ?? ""} className="mb-2 max-h-96 w-full rounded-lg border border-border/70" />
              ) : null}
              {s.voice_path ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                  <Mic className="size-4 shrink-0 text-primary" />
                  <span className="text-xs text-muted-foreground">تسجيل صوتي</span>
                  <audio controls src={urls[`voice-${s.id}`] ?? ""} className="h-9 flex-1" />
                </div>
              ) : null}
              {(s.submission_images ?? []).length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {(s.submission_images ?? [])
                    .slice()
                    .sort((a, b) => a.sort_number - b.sort_number)
                    .map((img) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={img.id} src={urls[`img-${img.id}`] ?? ""} alt={img.file_name} className="aspect-square w-full rounded-lg border border-border/70 object-cover" />
                    ))}
                </div>
              ) : null}
              {s.video_name || s.voice_name ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <VideoIcon className="size-3.5" />
                  {s.video_name || s.voice_name}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}