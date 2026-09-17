create or replace function public.close_overdue_conversations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
begin
  update public.conversations c
  set status = 'closed',
      closed_at = now(),
      closed_by = null,
      needs_revision = false,
      updated_at = now()
  from public.assignments a
  where a.id = c.assignment_id
    and c.status = 'active'
    and a.status = 'published'
    and a.due_at is not null
    and a.due_at <= now();

  get diagnostics closed_count = row_count;

  if closed_count > 0 then
    insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
    select c.student_id, 'closed', 'انتهى موعد الواجب',
           'انتهى الوقت المحدد لتسليم "' || a.title || '" وتُغلق المحادثة الآن.',
           '/student/assignments/' || c.id, a.id, c.id
    from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    where c.status = 'closed'
      and c.closed_at is not null
      and c.closed_at > now() - interval '5 minutes'
      and c.closed_by is null
    on conflict do nothing;
  end if;

  return closed_count;
end;
$$;

select cron.schedule('wajebati-close-overdue', '0 * * * *', $cron$select public.close_overdue_conversations();$cron$);