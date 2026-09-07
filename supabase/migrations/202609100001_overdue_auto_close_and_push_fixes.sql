-- Fixes for overdue conversations, DB-level post-deadline message blocking,
-- and push webhook resilience.
--
-- 1. can_post_message now also refuses messages once the assignment due date
--    has passed (matches can_submit_to_conversation's behavior).
-- 2. close_overdue_conversations() auto-closes active conversations whose
--    assignment due_at is in the past, keeps grades/submissions intact, and
--    inserts an in-app "closed" notification (which also feeds the push
--    trigger so students get a push).
-- 3. The push trigger skips posting to known-dead local URLs
--    (host.docker.internal / localhost) instead of failing silently, and
--    avoids re-posting the same notification twice.

begin;

-- ---------------------------------------------------------------------------
-- 1. Block chat after the due date at the DB level
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Auto-close overdue conversations + notify
-- ---------------------------------------------------------------------------
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

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wajebaty-close-overdue';
    perform cron.schedule(
      'wajebaty-close-overdue',
      '0 * * * *',
      $cron$select public.close_overdue_conversations();$cron$
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Push webhook resilience: skip known-dead local URLs
-- ---------------------------------------------------------------------------
create or replace function public.notify_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text;
begin
  select push_webhook_secret, push_webhook_url into v_secret, v_url
  from public.settings where id = 1;

  -- No secret yet => nothing to authenticate with.
  if v_secret is null or v_secret = '' then
    return new;
  end if;

  -- Dead local/default URLs must never be hit; the app patches push_webhook_url
  -- to the production app URL the first time any user loads the dashboard.
  if v_url is null
     or v_url like 'http://host.docker.internal%'
     or v_url like 'http://localhost%'
     or v_url like 'http://127.0.0.1%' then
    return new;
  end if;

  perform net.http_post(
    v_url,
    jsonb_build_object(
      'userId', new.user_id,
      'title', new.title,
      'body', new.body,
      'url', coalesce(new.href, '/')
    ),
    null,
    jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    5000
  );
  return new;
end;
$$;

commit;