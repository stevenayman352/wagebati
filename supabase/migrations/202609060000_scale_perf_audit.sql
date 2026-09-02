-- Scale & performance audit: targeted indexes + scoped unread query.
-- No RLS, no auth, no product semantics are changed. Indexes only, plus a
-- rewrite of public.unread_messages_for() that stops full-scannng messages.

-- Serve per-conversation unread lookups (conversation_id + sender_id + created_at)
-- so unread_messages_for() lateral scans terminate early instead of reading every row.
create index if not exists messages_conversation_sender_created_idx
  on public.messages (conversation_id, sender_id, created_at desc);

-- conversation_reads is upserted and joined by user_id + conversation_id;
-- the PK (conversation_id, user_id) already serves both sides, but add a
-- lookup by user_id alone for any "unread across convos for this user" scans.
create index if not exists conversation_reads_user_id_idx
  on public.conversation_reads (user_id, last_read_at desc);

-- Rewrite the per-user unread counter to scope to the user's accessible
-- conversations first (small set) and aggregate messages via a lateral join,
-- so the planner walks only that conversation's messages using
-- messages_conversation_sender_created_idx instead of scanning the whole table.
create or replace function public.unread_messages_for()
returns table (conversation_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  with my_conversations as (
    select c.id as conversation_id
    from public.conversations c
    join public.assignments a on a.id = c.assignment_id
    where public.is_admin() = true
       or c.student_id = auth.uid()
       or public.is_teacher_for_class(a.class_id) = true
  )
  select mc.conversation_id, count(*)::bigint
  from my_conversations mc
  join lateral (
    select m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = mc.conversation_id
      and m.sender_id <> auth.uid()
  ) ms on true
  left join public.conversation_reads cr
    on cr.conversation_id = mc.conversation_id and cr.user_id = auth.uid()
  where coalesce(cr.last_read_at, '-infinity'::timestamptz) < ms.created_at
  group by mc.conversation_id;
$$;

grant execute on function public.unread_messages_for() to authenticated;