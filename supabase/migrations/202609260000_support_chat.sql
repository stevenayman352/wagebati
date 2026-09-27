begin;

-- Support chat: a separate, identity-agnostic conversation spine that sits
-- beside the assignment-specific `conversations`/`messages` tables rather than
-- reusing them.
--
-- `conversations.assignment_id` is NOT NULL and `messages.sender_id` is a
-- required FK to `profiles`, so neither can host a pre-login visitor. Support
-- therefore gets its own tables with a nullable author and a free-text guest
-- code that is never validated against `profiles`.
--
-- Deliberately NOT created here: any notification trigger, web-push enqueue, or
-- `net.http_post` call. Unread state is derived from `support_thread_reads`
-- instead. Support conversations are never closed, so there is no `status`
-- column and no resolve/reopen flow.

-- ---------------------------------------------------------------------------
-- support_threads
-- ---------------------------------------------------------------------------
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  -- NULL for guests, set for students. Enforced single-thread-per-student by
  -- the partial unique index below.
  profile_id uuid references public.profiles (id) on delete cascade,
  guest_name text not null,
  guest_code text not null,
  -- sha256 hex of the 32-byte capability token. Guests are served by service
  -- role after an explicit comparison in app code; RLS never reads this.
  guest_token_hash text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint support_threads_guest_name_check check (char_length(guest_name) between 1 and 120),
  constraint support_threads_guest_code_check check (char_length(guest_code) between 1 and 60)
);

comment on table public.support_threads is
  'Support conversations for guests (profile_id null) and students (profile_id set). Never closed.';

-- One ongoing conversation per student.
create unique index if not exists support_threads_profile_id_uniq
  on public.support_threads (profile_id)
  where profile_id is not null;

-- Inbox ordering.
create index if not exists support_threads_last_message_at_idx
  on public.support_threads (last_message_at desc);

-- Login-time guest purge matches on this.
create index if not exists support_threads_guest_code_idx
  on public.support_threads (guest_code);

-- ---------------------------------------------------------------------------
-- support_messages
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  -- NULL for guests, and NULL for a deleted author profile (on delete set null
  -- keeps the message readable instead of cascading it away).
  author_profile_id uuid references public.profiles (id) on delete set null,
  author_kind text not null,
  -- Denormalized so a guest renaming their thread never rewrites history.
  guest_name text,
  kind text not null default 'text',
  body text not null default '',
  storage_path text,
  file_name text,
  mime_type text,
  file_size integer,
  duration_seconds numeric,
  reply_to_message_id uuid references public.support_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_messages_author_kind_check
    check (author_kind in ('student', 'admin', 'guest')),
  constraint support_messages_kind_check
    check (kind in ('text', 'voice', 'image', 'video')),
  constraint support_messages_check
    check (
      (kind = 'text' and body <> '' and storage_path is null) or
      (kind in ('voice', 'image', 'video') and storage_path is not null)
    ),
  constraint support_messages_file_size_check
    check (file_size is null or file_size <= 262144000),
  -- A guest must never present an author_profile_id; that is the row of an
  -- authenticated student or admin and is exactly what the RLS relies on.
  constraint support_messages_guest_author_check
    check (author_kind <> 'guest' or author_profile_id is null)
);

create index if not exists support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- support_thread_reads
-- ---------------------------------------------------------------------------
-- `reader_key` is one text column serving all three audiences rather than a
-- polymorphic uuid FK: 'admin' for admins, a profile uuid for students, and the
-- guest token hash for guests. Guests cannot call the RPCs below (they are not
-- authenticated), so their unread is computed in app code.
create table if not exists public.support_thread_reads (
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  reader_key text not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, reader_key)
);

-- ---------------------------------------------------------------------------
-- last_message_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_support_thread_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_threads
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch on public.support_messages;
create trigger support_messages_touch
after insert on public.support_messages
for each row execute function public.touch_support_thread_after_message();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_access_support_thread(target_thread uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.support_threads t
    where t.id = target_thread
      and (public.is_admin() = true or t.profile_id = auth.uid())
  );
$$;

create or replace function public.can_post_support_message(target_thread uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.support_threads t
    where t.id = target_thread
      and (public.is_admin() = true or t.profile_id = auth.uid())
  );
$$;

-- Media object routing helper for storage policies. Object layout:
--   support-media/{thread_id}/{file}
--
-- Returns the thread id only for a well-formed path, and null otherwise. A
-- malformed object name must not raise here: this runs inside an RLS predicate,
-- and a failed cast would surface as a request error rather than a policy
-- denial. `can_post_support_message(null)` is false, so an unparseable name
-- simply cannot be uploaded.
create or replace function public.support_media_thread_id(object_name text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  parsed uuid;
  file_part text;
begin
  if split_part(object_name, '/', 1) <> 'support-media' then
    return null;
  end if;

  begin
    parsed := split_part(object_name, '/', 2)::uuid;
  exception when others then
    return null;
  end;

  -- Exactly one filename segment, and it must not be empty or a parent
  -- directory reference, so an object cannot be parked in a directory the
  -- caller does not own.
  if array_length(string_to_array(object_name, '/'), 1) is distinct from 3 then
    return null;
  end if;
  file_part := split_part(object_name, '/', 3);
  if file_part = '' or file_part like '.%' then
    return null;
  end if;

  return parsed;
end;
$$;

revoke all on function public.support_media_thread_id(text) from public;
grant execute on function public.support_media_thread_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Unread counters (authenticated callers only)
-- ---------------------------------------------------------------------------
-- Per-thread counts for the admin inbox rows and the student badge. Scoped to
-- the caller's own reader_key, and it must match auth.uid() unless the caller is
-- an admin, so a student cannot read another student's counters.
create or replace function public.support_unread_counts(p_reader_key text)
returns table (thread_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  with my_threads as (
    select t.id as thread_id
    from public.support_threads t
    where public.is_admin() = true
       or t.profile_id = auth.uid()
  )
  select mt.thread_id, count(*)::bigint
  from my_threads mt
  join lateral (
    select m.created_at
    from public.support_messages m
    where m.thread_id = mt.thread_id
      and m.author_profile_id is distinct from auth.uid()
  ) ms on true
  left join public.support_thread_reads cr
    on cr.thread_id = mt.thread_id and cr.reader_key = p_reader_key
  where coalesce(cr.last_read_at, '-infinity'::timestamptz) < ms.created_at
  group by mt.thread_id;
$$;

-- Scalar total for the nav badges, so the badge is a single round trip.
create or replace function public.support_unread_total(p_reader_key text)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(unread_count), 0)::bigint
  from public.support_unread_counts(p_reader_key);
$$;

revoke all on function public.support_unread_counts(text) from public;
grant execute on function public.support_unread_counts(text) to authenticated;
revoke all on function public.support_unread_total(text) from public;
grant execute on function public.support_unread_total(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_thread_reads enable row level security;

-- support_threads
create policy "support threads readable" on public.support_threads
for select using (public.is_admin() = true or profile_id = auth.uid());

create policy "support threads admin insert" on public.support_threads
for insert with check (public.is_admin() = true or profile_id = auth.uid());

create policy "support threads admin update" on public.support_threads
for update using (public.is_admin() = true)
with check (public.is_admin() = true);

create policy "support threads admin delete" on public.support_threads
for delete using (public.is_admin() = true);

-- support_messages
create policy "support messages readable" on public.support_messages
for select using (public.can_access_support_thread(thread_id));

create policy "support messages insertable" on public.support_messages
for insert with check (
  public.can_post_support_message(thread_id)
  and (public.is_admin() = true or author_profile_id = auth.uid())
);

-- No message update or delete policy: support history is append-only for
-- authenticated users. Admins remove a thread, they do not rewrite it.

-- support_thread_reads
create policy "support reads readable" on public.support_thread_reads
for select using (public.can_access_support_thread(thread_id));

create policy "support reads own insert" on public.support_thread_reads
for insert with check (
  public.can_access_support_thread(thread_id)
  and (public.is_admin() = true or reader_key = auth.uid()::text)
);

-- The update policy must constrain `reader_key` exactly like the insert policy
-- does. Without that check, any participant of a thread could overwrite another
-- reader's marker (including the shared `admin` key) and silently mark other
-- people's messages as read.
create policy "support reads own update" on public.support_thread_reads
for update using (
  public.can_access_support_thread(thread_id)
  and (public.is_admin() = true or reader_key = auth.uid()::text)
)
with check (
  public.can_access_support_thread(thread_id)
  and (public.is_admin() = true or reader_key = auth.uid()::text)
);

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
-- Private bucket. Guests have no session, so they upload through service-role
-- signed upload URLs and never reach the policy below. Students and admins
-- upload directly with their session token, so an insert policy is required:
-- without one, every signed-in support upload is denied by RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-media', 'support-media', false, 262144000,
  array['video/mp4','video/quicktime','image/jpeg','image/png','image/webp','audio/mpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Reads still go through service-role signed URLs, so deliberately there is no
-- select/update/delete policy for this bucket. That keeps the object table
-- closed to anon/authenticated, while the `bucket_id` guard keeps this rule
-- from applying to the other four buckets.
drop policy if exists "support media upload by authorized members" on storage.objects;
create policy "support media upload by authorized members" on storage.objects
for insert with check (
  bucket_id = 'support-media'
  and owner = auth.uid()
  and public.can_post_support_message(public.support_media_thread_id(name))
);

-- ---------------------------------------------------------------------------
-- Realtime publication (students and admins; guests poll)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;

commit;
