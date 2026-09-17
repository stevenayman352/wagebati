-- Allow updating the due date of a published assignment so teachers can
-- reopen a closed homework with a new deadline (or remove the deadline for
-- manual closing) — the reopen-assignment feature needs this through the
-- service-role client.
--
-- Everything else about a published assignment stays frozen: title,
-- instructions, max_grade, class_id and status are still guarded.

create or replace function public.guard_published_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'published' and (
    new.title is distinct from old.title
    or new.instructions is distinct from old.instructions
    or new.max_grade is distinct from old.max_grade
    or new.class_id is distinct from old.class_id
    or new.status is distinct from 'published'
  ) then
    raise exception 'الواجب منشور ولا يمكن تعديله';
  end if;
  return new;
end;
$$;