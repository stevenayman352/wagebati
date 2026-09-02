begin;

-- Post-cleanup, a video-only submission has its video_* columns nulled but its
-- record (and any grade) must persist. The previous constraint forced
-- "video_path OR voice_path NOT NULL", which blocked that. Relax it so a
-- submission may retain no media path after the 30-day video purge.
alter table public.submissions drop constraint if exists submissions_check;

commit;