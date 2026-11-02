-- Migration: Courses Enhancements with Instructor, Department, Schedule, Room
alter table public.courses
  add column if not exists instructor text default '',
  add column if not exists department text default '',
  add column if not exists schedule text default '',
  add column if not exists room text default '';

-- Enable updating courses for superusers
create policy "Superusers can update course details"
  on public.courses for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant update on public.courses to authenticated;

