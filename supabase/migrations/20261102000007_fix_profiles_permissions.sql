-- Migration: 20261102000007_fix_profiles_permissions.sql
-- Fix permission denied for table profiles by granting table privileges and setting full RLS policies

-- 1. Grant table-level privileges on public.profiles
grant select, insert, update, delete on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;
grant select on table public.profiles to anon;

-- Also ensure assessment_questions has select for authenticated (guarded by superuser RLS)
grant select on table public.assessment_questions to authenticated;

-- 2. Clean up and establish comprehensive RLS policies on public.profiles
alter table public.profiles enable row level security;

-- Superusers have full control (SELECT, INSERT, UPDATE, DELETE) over all profiles
drop policy if exists "Superusers can approve student profiles" on public.profiles;
drop policy if exists "Superusers have full control over profiles" on public.profiles;
create policy "Superusers have full control over profiles"
  on public.profiles
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

-- Users can view their own profile and superusers can view all
drop policy if exists "Profiles are visible to their owner and superusers" on public.profiles;
create policy "Profiles are visible to their owner and superusers"
  on public.profiles
  for select
  to authenticated
  using (((id = (select auth.uid())) or (select public.is_superuser())));

-- Students/users can update their own profile (cannot elevate role or approve themselves)
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = 'student');

