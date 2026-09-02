begin;

-- settings holds sensitive credentials (vapid_private_key, push_webhook_secret).
-- It is only accessed server-side (service role) or by security definer triggers,
-- so no anon/authenticated client role needs direct access.
-- Enable RLS and deny all direct reads/writes by client roles.
alter table public.settings enable row level security;

create policy "settings deny all anon" on public.settings
  for select using (false);

create policy "settings deny all write" on public.settings
  for all using (false) with check (false);

commit;
