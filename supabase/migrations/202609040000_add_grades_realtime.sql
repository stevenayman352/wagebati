begin;

-- Allow teachers' grade saves to reach the student's open assignment page live
alter publication supabase_realtime add table public.grades;

commit;