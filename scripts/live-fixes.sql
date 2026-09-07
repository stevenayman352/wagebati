-- ============================================================
-- Wagbati live fixes — PASTE ALL OF THIS INTO Supabase → SQL Editor → New query → Run
-- Safe to run again (everything is idempotent).
-- ============================================================

-- 1) Storage: allow videos up to 5GB in chat + submissions (no practical video limit)
update storage.buckets
set file_size_limit = 5368709120,
    allowed_mime_types = array['video/mp4','video/quicktime','image/jpeg','image/png','image/webp','audio/mpeg']
where id in ('message-media','submissions');

-- 2) Live feed/bell: publish notifications to realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- 3) Push webhook trigger (cannot block inserts)
create or replace function public.notify_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text;
  v_body jsonb;
begin
  select push_webhook_secret, push_webhook_url into v_secret, v_url
  from public.settings where id = 1;
  if v_secret is null or v_secret = '' then
    return new;
  end if;
  if v_url is null
     or v_url like 'http://host.docker.internal%'
     or v_url like 'http://localhost%'
     or v_url like 'http://127.0.0.1%' then
    return new;
  end if;
  v_body := jsonb_build_object('userId', new.user_id, 'title', new.title,
    'body', new.body, 'url', coalesce(new.href, '/'));
  begin
    perform net.http_post(v_url, v_body, null,
      jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      5000);
  exception when others then
    raise log 'push notify skipped for user %: %', new.user_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notifications_web_push on public.notifications;
create trigger notifications_web_push
after insert on public.notifications
for each row execute function public.notify_push_after_insert();

-- 4) Block chat after the due date
create or replace function public.can_post_message(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (
    public.can_access_conversation(target_conversation)
    and exists (
      select 1
      from public.conversations c
      join public.assignments a on a.id = c.assignment_id
      where c.id = target_conversation
        and c.status = 'active'
        and a.status = 'published'
        and (a.due_at is null or a.due_at > now())
    )
  );
$$;

-- 5) Auto-close overdue conversations
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
  set status = 'closed', closed_at = now(), closed_by = null,
      needs_revision = false, updated_at = now()
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

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wajebaty-close-overdue';
    perform cron.schedule(
      'wajebaty-close-overdue', '0 * * * *',
      $cron$select public.close_overdue_conversations();$cron$
    );
  end if;
end;
$$;

-- 6) First-login password field
alter table public.profiles add column if not exists initial_password text;

-- 7) Grades stay hidden from students (no grade notification)
drop trigger if exists grade_creates_notification on public.grades;
drop function if exists public.notify_after_grade();