begin;

create policy "notifications app insert"
on public.notifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_teacher_for_class(
    (select a.class_id from public.assignments a where a.id = assignment_id)
  )
);

commit;