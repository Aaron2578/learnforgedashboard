-- Migration: Material recipients permissions table
-- Allows administrators to permit/grant specific course materials and notes to individual students

create table if not exists public.material_recipients (
  material_id uuid not null references public.course_materials (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  permitted_at timestamptz not null default now(),
  primary key (material_id, student_id)
);

create index if not exists material_recipients_student_idx on public.material_recipients (student_id);
create index if not exists material_recipients_material_idx on public.material_recipients (material_id);

alter table public.material_recipients enable row level security;

-- Policy: Students can view material permissions assigned to them
create policy "Students view their assigned material permissions"
  on public.material_recipients for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));

-- Policy: Superusers manage material permissions
create policy "Superusers manage material permissions"
  on public.material_recipients for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant select, insert, update, delete on public.material_recipients to authenticated;

-- Add material_id reference to student_notes if not present
alter table public.student_notes
  add column if not exists material_id uuid references public.course_materials (id) on delete cascade;

-- Realtime publication
alter table public.material_recipients replica identity full;
alter publication supabase_realtime add table public.material_recipients;

