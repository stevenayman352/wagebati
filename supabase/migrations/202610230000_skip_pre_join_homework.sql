begin;

-- ---------------------------------------------------------------------------
-- New enrollments (including transfers) must not receive homework that had
-- already ended before the student joined the class.
--
-- The trigger used to create a conversation for EVERY published assignment of
-- the class. A student transferred from D to B therefore got a fresh, empty
-- conversation for all of B's past homework, and the student dashboard showed
-- months of old homework as "لم يسلم بعد" — plus a "واجب جديد" notification
-- for each one. Only still-open homework is backfilled now; future homework is
-- handled by the publish trigger as usual.
-- ---------------------------------------------------------------------------

create or replace function public.create_conversation_for_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversations (assignment_id, student_id)
  select a.id, new.student_id
  from public.assignments a
  where a.class_id = new.class_id
    and a.status = 'published'
    and (a.due_at is null or a.due_at >= now())
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  select new.student_id, 'new_assignment', 'واجب جديد', a.title, '/student/assignments/' || c.id, a.id, c.id
  from public.assignments a
  join public.conversations c on c.assignment_id = a.id and c.student_id = new.student_id
  where a.class_id = new.class_id
    and a.status = 'published'
    and (a.due_at is null or a.due_at >= now())
  on conflict do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clean up the rows the old trigger already produced: a conversation on a class
-- the student joined AFTER the homework had ended. Untouched conversations only
-- (no submission, no grade, no message of any kind), so no real work is ever
-- removed. Their "واجب جديد" notifications cascade with the conversation.
--
-- `class_students.created_at` is the join time: a transfer deletes the old row
-- and inserts the new one, so it is the transfer timestamp.
-- ---------------------------------------------------------------------------

delete from public.conversations c
using public.assignments a, public.class_students cs
where c.assignment_id = a.id
  and cs.class_id = a.class_id
  and cs.student_id = c.student_id
  and a.status = 'published'
  and a.due_at is not null
  and a.due_at < cs.created_at
  and (a.published_at is null or a.published_at < cs.created_at)
  and not exists (select 1 from public.submissions s where s.conversation_id = c.id)
  and not exists (select 1 from public.grades g where g.conversation_id = c.id)
  and not exists (select 1 from public.messages m where m.conversation_id = c.id);

commit;
