-- ---------------------------------------------------------------------------
-- Let admins read and write grades
-- ---------------------------------------------------------------------------
-- The `grades` policies only covered the graded student and the teachers of the
-- assignment's class, so an admin could not read a grade sheet at all. The
-- Excel export worked around it by querying through the service-role client
-- (app/api/export/route.ts), which meant the admin grade sheet had to do the
-- same — bypassing row level security for every read and every write.
--
-- Postgres ORs permissive policies together, so these two are additive: the
-- teacher/student rules above keep working exactly as they did, and an admin
-- now simply becomes one more allowed role.
--
-- `graded_by` stays NOT NULL, so admin edits are attributed to the admin's own
-- profile id, the same way teacher edits are attributed to the teacher.

drop policy if exists "grades admin read" on public.grades;
create policy "grades admin read" on public.grades
for select using (public.is_admin());

drop policy if exists "grades admin manage" on public.grades;
create policy "grades admin manage" on public.grades
for all using (public.is_admin()) with check (public.is_admin());
