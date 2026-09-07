begin;

-- Remove grade recorded notifications
drop trigger if exists grade_creates_notification on public.grades;
drop function if exists public.notify_after_grade();

commit;