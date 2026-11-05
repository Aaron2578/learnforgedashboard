-- Migration: Trainer Student Assignment System
-- Adds trainer_students table and trainer_id to profiles

-- 1. Add direct trainer_id to profiles for students
alter table public.profiles
  add column if not exists trainer_id uuid references public.profiles (id) on delete set null;

-- 2. Create trainer_students many-to-many relationship table
create table if not exists public.trainer_students (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trainer_id, student_id)
);

create index if not exists trainer_students_trainer_idx on public.trainer_students (trainer_id);
create index if not exists trainer_students_student_idx on public.trainer_students (student_id);

-- 3. Enable RLS and permissions
alter table public.trainer_students enable row level security;
grant all on public.trainer_students to authenticated;

-- Policies for trainer_students
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trainer_students' and policyname = 'Authenticated view trainer_students'
  ) then
    create policy "Authenticated view trainer_students"
      on public.trainer_students for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trainer_students' and policyname = 'Superusers and trainers manage trainer_students'
  ) then
    create policy "Superusers and trainers manage trainer_students"
      on public.trainer_students for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

