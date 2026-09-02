begin;

create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  vapid_public_key text,
  vapid_private_key text,
  push_webhook_secret text,
  push_webhook_url text not null default 'http://host.docker.internal:3000/api/push/send',
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push own read" on public.push_subscriptions
for select using (user_id = auth.uid());

create policy "push own insert" on public.push_subscriptions
for insert with check (user_id = auth.uid());

create policy "push own delete" on public.push_subscriptions
for delete using (user_id = auth.uid());

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
  if v_secret is null or v_secret = '' then
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

drop trigger if exists notifications_web_push on public.notifications;
create trigger notifications_web_push
after insert on public.notifications
for each row execute function public.notify_push_after_insert();

commit;