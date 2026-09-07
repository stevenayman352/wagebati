begin;

-- Push/notification verification fixes.
--
-- 1. Add `notifications` to the default realtime publication so the in-app
--    feed and header bell receive new notifications live (they were silently
--    missing — only messages/conversations/grades were published).
-- 2. Harden notify_push_after_insert() so a push/webhook failure can never
--    abort the underlying operation (e.g. submitting an assignment or
--    publishing a homework must never roll back because the push could not be
--    dispatched). The HTTP POST is best-effort.

-- 1. Realtime for notifications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- 2. Push webhook trigger that can never block inserts
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

  v_body := jsonb_build_object(
    'userId', new.user_id,
    'title', new.title,
    'body', new.body,
    'url', coalesce(new.href, '/')
  );

  begin
    perform net.http_post(
      v_url,
      v_body,
      null,
      jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      5000
    );
  exception when others then
    -- Never let a push/webhook problem break the triggering insert.
    raise log 'push notify skipped for user %: %', new.user_id, sqlerrm;
  end;

  return new;
end;
$$;

commit;