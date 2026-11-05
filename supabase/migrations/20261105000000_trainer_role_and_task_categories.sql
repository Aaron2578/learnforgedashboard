-- Migration: Add Trainer Role, Task Assignment System, and Expanded File Categories
-- Allows 'trainer' role in profiles, expands file categories for materials,
-- and supports the Task assignment system for trainers and administrators.

-- 1. Expand role check constraint on profiles to include 'trainer'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check 
  check (role in ('student', 'superuser', 'trainer', 'admin'));

-- 2. Drop category check constraint on course_materials to allow:
-- 'Class Notes', 'Materials', 'Practice Data Sets', 'Projects', 'Tasks', 'Task', 'Syllabus', etc.
alter table public.course_materials drop constraint if exists course_materials_category_check;

-- 3. Add task status, category, and due_at to student_notes
alter table public.student_notes
  add column if not exists status text default 'assigned',
  add column if not exists category text default 'Task',
  add column if not exists due_at timestamptz;

-- 4. Create is_trainer helper function
create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('trainer', 'superuser')
  );
$$;

revoke all on function public.is_trainer() from public;
grant execute on function public.is_trainer() to authenticated;

-- 5. Grant RLS permissions for trainers on course_materials
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_materials' and policyname = 'Trainers manage course materials'
  ) then
    create policy "Trainers manage course materials"
      on public.course_materials for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 6. Grant RLS permissions for trainers on download_requests
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'download_requests' and policyname = 'Trainers manage download requests'
  ) then
    create policy "Trainers manage download requests"
      on public.download_requests for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 7. Grant RLS permissions for trainers on student_notes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'student_notes' and policyname = 'Trainers manage student tasks'
  ) then
    create policy "Trainers manage student tasks"
      on public.student_notes for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 8. Grant RLS permissions for trainers on attendance_records
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance_records' and policyname = 'Trainers manage attendance records'
  ) then
    create policy "Trainers manage attendance records"
      on public.attendance_records for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 9. Grant RLS permissions for trainers on material_recipients
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'material_recipients' and policyname = 'Trainers manage material permissions'
  ) then
    create policy "Trainers manage material permissions"
      on public.material_recipients for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;
