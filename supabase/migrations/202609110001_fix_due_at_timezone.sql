-- Correct due_at values that were stored 3 hours late (UTC) instead of
-- the school's local time (Gulf, UTC+3, no DST).
-- Run ONCE in the Supabase SQL editor.
-- guard_published_assignment must be disabled because it blocks any change
-- to published assignments; it is re-enabled in the same transaction.

begin;

alter table public.assignments disable trigger assignment_guard_publish;

update public.assignments
set due_at = due_at - interval '3 hours';

select id, title, due_at from public.assignments order by due_at;

alter table public.assignments enable trigger assignment_guard_publish;

commit;