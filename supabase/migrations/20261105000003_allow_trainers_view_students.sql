-- Migration: Allow trainers to view student profiles and assigned data
-- Fixes issue where trainers could not see student profiles due to restrictive profiles RLS

drop policy if exists "Profiles are visible to their owner and superusers" on public.profiles;
drop policy if exists "Profiles are visible to their owner, trainers and superusers" on public.profiles;

create policy "Profiles are visible to their owner, trainers and superusers"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_superuser())
    or (select public.is_trainer())
  );

-- Also ensure trainers can update attendance records and tasks for their students
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.trainer_students to authenticated;

