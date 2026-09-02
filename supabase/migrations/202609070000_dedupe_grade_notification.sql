-- Prevent duplicate "grade recorded" notifications on re-save.
--
-- notify_after_grade previously fired on EVERY insert or update of grades.
-- Server actions upsert on conversation_id and the front-end GradeAutosave
-- saves per input change, so re-saving the same grade value created a fresh
-- notification row each time. This keeps the notification for a genuinely new
-- grade (insert) and for a real grade change (update with a different value),
-- but skips the notification when the grade value is unchanged (re-save,
-- retry, or idempotent re-execution). RLS / auth / data are unaffected.

create or replace function public.notify_after_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip the notification when an updated row kept the same grade value.
  if TG_OP = 'UPDATE' and new.grade is not distinct from old.grade then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, href, assignment_id, conversation_id)
  values (new.student_id, 'grade_recorded', 'تم تسجيل الدرجة', 'درجة جديدة متاحة الآن',
          '/student/assignments/' || new.conversation_id, new.assignment_id, new.conversation_id);
  return new;
end;
$$;

drop trigger if exists grade_creates_notification on public.grades;
create trigger grade_creates_notification after insert or update on public.grades
for each row execute function public.notify_after_grade();