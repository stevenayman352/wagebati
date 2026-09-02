begin;
create or replace function public.cleanup_closed_conversation_files()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer;
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
  using public.submissions s
  join public.conversations c on c.id = s.conversation_id
  where o.bucket_id = 'submissions'
    and o.name = s.video_path
    and s.video_path is not null
    and c.status = 'closed'
    and c.closed_at < now() - interval '30 days';

  get diagnostics deleted_count = row_count;

  update public.submissions s
  set video_path = null, video_name = null, video_mime = null, video_size = null
  from public.conversations c
  where c.id = s.conversation_id
    and s.video_path is not null
    and c.status = 'closed'
    and c.closed_at < now() - interval '30 days';

  insert into public.cleanup_runs (deleted_count) values (deleted_count);
  return deleted_count;
end;
$$;
commit;
