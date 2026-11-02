-- Migration: 20261102000004_record_exam_attempts.sql
-- Allow admins and students to record and manage assessment attempts and track cohort completion

-- 1. RLS policy on assessment_attempts for administrators / superusers
create policy "Superusers can manage all assessment attempts"
  on public.assessment_attempts for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant all on public.assessment_attempts to authenticated;

-- 2. Function for an approved student to confirm completion of an external assessment (e.g. Google Form)
create or replace function public.student_complete_external_assessment(p_assessment_id uuid)
returns public.assessment_attempts
language plpgsql
security definer
as $$
declare
  v_student_id uuid := auth.uid();
  v_attempt public.assessment_attempts;
begin
  if v_student_id is null or not public.is_student_approved() then
    raise exception 'An approved student account is required.';
  end if;

  -- Ensure student is assigned to this assessment
  if not exists (
    select 1 from public.assessments a
    join public.assessment_recipients r on r.assessment_id = a.id
    where a.id = p_assessment_id
      and r.student_id = v_student_id
      and a.published
  ) then
    raise exception 'You are not assigned to this assessment.';
  end if;

  insert into public.assessment_attempts (
    assessment_id,
    student_id,
    answers,
    score,
    max_score,
    submitted_at
  )
  values (
    p_assessment_id,
    v_student_id,
    '{"status": "submitted_externally", "method": "student_confirmed"}'::jsonb,
    100,
    100,
    now()
  )
  on conflict (assessment_id, student_id) do update set
    submitted_at = coalesce(assessment_attempts.submitted_at, now())
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.student_complete_external_assessment(uuid) to authenticated;

-- 3. Function for Admin / Instructor to record or update any student's assessment attempt & score
create or replace function public.admin_record_assessment_attempt(
  p_assessment_id uuid,
  p_student_id uuid,
  p_score integer default 100,
  p_max_score integer default 100
)
returns public.assessment_attempts
language plpgsql
security definer
as $$
declare
  v_attempt public.assessment_attempts;
begin
  if not public.is_superuser() then
    raise exception 'Administrator permissions required.';
  end if;

  if p_score < 0 then
    raise exception 'Score cannot be negative.';
  end if;

  if p_max_score <= 0 or p_score > p_max_score then
    p_max_score := greatest(p_max_score, p_score, 100);
  end if;

  insert into public.assessment_attempts (
    assessment_id,
    student_id,
    answers,
    score,
    max_score,
    submitted_at
  )
  values (
    p_assessment_id,
    p_student_id,
    '{"recorded_by": "admin"}'::jsonb,
    p_score,
    p_max_score,
    now()
  )
  on conflict (assessment_id, student_id) do update set
    score = excluded.score,
    max_score = excluded.max_score,
    submitted_at = coalesce(assessment_attempts.submitted_at, now())
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.admin_record_assessment_attempt(uuid, uuid, integer, integer) to authenticated;
