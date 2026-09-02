begin;

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
      then public.can_post_message(split_part(object_name, '/', 2)::uuid)
    when split_part(object_name, '/', 1) = 'message-media'
      and split_part(object_name, '/', 2) <> ''
      then public.can_post_message(split_part(object_name, '/', 2)::uuid)
    else false
  end;
$function$;

drop table if exists public.__dbg_note;

commit;