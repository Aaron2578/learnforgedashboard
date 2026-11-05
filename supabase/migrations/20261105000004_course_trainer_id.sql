-- Migration: Add trainer_id to courses table
alter table public.courses
  add column if not exists trainer_id uuid references public.profiles (id) on delete set null;

create index if not exists courses_trainer_idx on public.courses (trainer_id);

grant select, update on public.courses to authenticated;
