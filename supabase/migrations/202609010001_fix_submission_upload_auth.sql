begin;

-- Submissions must be gated by the SAME authorization as creating the
-- submission row (deadline + ownership + assignment + active conversation).
-- Migration 202608300006 incorrectly switched the 'submissions' branch to
-- can_post_message, which only checks conversation access + active status and
-- DROPPED the due-date / published checks. That allowed a file to be stored
-- after the deadline (orphan), even though the row insert later rejected it.
--
-- Restore submission uploads to can_submit_to_conversation which enforces:
--   * the student owns the conversation
--   * conversation belongs to the assignment
--   * assignment belongs to the student's class (via can_submit + RLS)
--   * conversation is active
--   * assignment is published
--   * due date has not passed
--
-- message-media uploads keep can_post_message (chat media), which is correct.

create or replace function public.can_upload_media_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when split_part(object_name, '/', 1) = 'assignment-attachments'
      and split_part(object_name, '/', 2) <> ''
      then public.can_draft_edit_assignment(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'submissions'
      and split_part(object_name, '/', 2) <> ''
      then public.can_submit_to_conversation(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'message-media'
      and split_part(object_name, '/', 2) <> ''
      then public.can_post_message(split_part(object_name, '/', 2)::uuid)
    else false
  end;
$function$;

commit;
