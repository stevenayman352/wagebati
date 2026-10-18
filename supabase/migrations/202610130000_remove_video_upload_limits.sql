begin;

-- Remove the application-level size ceiling on stored videos. The client now
-- transcodes arbitrary inputs down to SAFE_UPLOAD_BYTES instead of rejecting
-- anything over a platform cap, so neither the bucket nor the messages table
-- should enforce a video size limit.

update storage.buckets
set file_size_limit = null
where id in ('submissions', 'message-media', 'support-media');

alter table public.messages
  drop constraint if exists messages_file_size_check;

alter table public.submissions
  drop constraint if exists submissions_video_size_check;

commit;