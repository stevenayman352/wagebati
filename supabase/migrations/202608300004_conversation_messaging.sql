-- Phase 7: conversation messaging support
-- last_message_at, needs_revision, closed_by, per-user read state, unread helper, teacher submission notifications

alter table public.conversations add column if not exists last_message_at timestamptz;
alter table public.conversations add column if not exists needs_revision boolean not null default false;
alter table public.conversations add column if not exists closed_by uuid references public.profiles(id) on delete set null;

create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now(),
      last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;
  return new;
end;
$$;

create or replace function public.notify_teachers_of_submission(target_submission uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
  v_assignment uuid;
  v_attempt integer;
  v_title text;
begin
  select conversation_id, assignment_id, attempt_number into v_conversation, v_assignment, v_attempt
  from public.submissions where id = target_submission;

  select a.title into v_title from public.assignments a where a.id = v_assignment;

  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  select ct.teacher_id,
         'submission',
         'تسليم جديد',
         'أرسل الطالب محاولة ' || v_attempt || ' في "' || v_title || '"',
         '/teacher/conversations/' || v_conversation,
         v_assignment,
         v_conversation
  from public.assignments a
  join public.class_teachers ct on ct.class_id = a.class_id
  where a.id = v_assignment;
end;
$$;

create or replace function public.submission_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set needs_revision = false where id = new.conversation_id;
  perform public.notify_teachers_of_submission(new.id);
  return new;
end;
$$;

drop trigger if exists submissions_received on public.submissions;
create trigger submissions_received after insert on public.submissions
for each row execute function public.submission_received();

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

drop policy if exists "conversation reads own select" on public.conversation_reads;
create policy "conversation reads own select" on public.conversation_reads
for select using (user_id = auth.uid());

drop policy if exists "conversation reads own insert" on public.conversation_reads;
create policy "conversation reads own insert" on public.conversation_reads
for insert with check (user_id = auth.uid());

drop policy if exists "conversation reads own update" on public.conversation_reads;
create policy "conversation reads own update" on public.conversation_reads
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.unread_messages_for()
returns table (conversation_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select ms.conversation_id, count(*)::bigint
  from (
    select m.conversation_id, m.sender_id, m.created_at
    from public.messages m
  ) ms
  join public.conversations c on c.id = ms.conversation_id and public.can_access_conversation(c.id)
  left join public.conversation_reads cr
    on cr.conversation_id = ms.conversation_id and cr.user_id = auth.uid()
  where ms.sender_id <> auth.uid()
    and coalesce(cr.last_read_at, '-infinity'::timestamptz) < ms.created_at
  group by ms.conversation_id;
$$;

grant execute on function public.unread_messages_for() to authenticated;
grant execute on function public.notify_teachers_of_submission(uuid) to authenticated;