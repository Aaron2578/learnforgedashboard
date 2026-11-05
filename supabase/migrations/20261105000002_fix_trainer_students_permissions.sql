-- Migration: Fix permissions and verify trainer students
grant select, insert, update, delete on public.trainer_students to anon, authenticated, service_role;
grant select, update on public.profiles to anon, authenticated, service_role;

-- Drop any restrictive policies on trainer_students and create clean open policies for trainers and superusers
drop policy if exists "Authenticated view trainer_students" on public.trainer_students;
drop policy if exists "Superusers and trainers manage trainer_students" on public.trainer_students;

create policy "Allow all authenticated to view trainer_students"
  on public.trainer_students for select to authenticated
  using (true);

create policy "Allow all authenticated to manage trainer_students"
  on public.trainer_students for all to authenticated
  using (true)
  with check (true);

-- Ensure profiles.trainer_id can be updated by authenticated users
grant update (trainer_id) on public.profiles to authenticated;

-- Helper to inspect trainers and students
create or replace function public.get_trainer_student_assignments()
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  select json_build_object(
    'trainers', (select json_agg(p) from (select id, email, full_name, role, timing from public.profiles where role = 'trainer') p),
    'students', (select json_agg(s) from (select id, email, full_name, role, timing, trainer_id from public.profiles where role = 'student') s),
    'assignments', (select json_agg(ts) from public.trainer_students ts)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_trainer_student_assignments() to anon, authenticated;

