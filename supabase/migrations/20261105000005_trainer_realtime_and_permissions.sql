-- Migration: Enable Realtime for material_recipients & trainer_students,
-- and grant Trainer permissions for tests/assessments targeting.

begin;

-- 1. Ensure replica identity full on relational tables for complete payload diffs
alter table public.material_recipients replica identity full;
alter table public.trainer_students replica identity full;

-- 2. Add to supabase_realtime publication if not already present
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'material_recipients'
  ) then
    alter publication supabase_realtime add table public.material_recipients;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trainer_students'
  ) then
    alter publication supabase_realtime add table public.trainer_students;
  end if;
end $$;

-- 3. Trainer policies for assessments & test targeting
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessments' and policyname = 'Trainers manage assessments'
  ) then
    create policy "Trainers manage assessments"
      on public.assessments for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_recipients' and policyname = 'Trainers manage test targeting'
  ) then
    create policy "Trainers manage test targeting"
      on public.assessment_recipients for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_attempts' and policyname = 'Trainers view assessment attempts'
  ) then
    create policy "Trainers view assessment attempts"
      on public.assessment_attempts for select to authenticated
      using ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assessment_questions' and policyname = 'Trainers manage questions'
  ) then
    create policy "Trainers manage questions"
      on public.assessment_questions for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

grant select, insert, update, delete on public.assessments, public.assessment_recipients, public.assessment_questions to authenticated;

commit;
