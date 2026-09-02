begin;

create or replace function public.notify_target_is_in_class(target_class uuid, target_student uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.class_students cs
    join public.profiles p on p.id = cs.student_id
    where cs.class_id = target_class
      and cs.student_id = target_student
      and p.role = 'student'
      and p.is_active
  );
$$;

drop policy if exists "notifications app insert" on public.notifications;

create policy "notifications app insert"
on public.notifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  or (
    public.is_teacher_for_class((select a.class_id from public.assignments a where a.id = assignment_id))
    and public.notify_target_is_in_class((select a.class_id from public.assignments a where a.id = assignment_id), user_id)
  )
);

commit;