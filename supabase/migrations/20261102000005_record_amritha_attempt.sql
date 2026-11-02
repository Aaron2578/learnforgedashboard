-- Update admin_record_assessment_attempt to allow postgres/service_role and superusers
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
  if auth.uid() is not null and not public.is_superuser() then
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

-- Also record Amritha's completed exam
insert into public.assessment_attempts (
  assessment_id,
  student_id,
  answers,
  score,
  max_score,
  submitted_at
)
values (
  '8996cee5-b72d-4346-ab0c-4260038648d6',
  '051e6aae-111b-4e30-a76e-30e060bfc865',
  '{"status": "completed", "external_form": "submitted"}'::jsonb,
  100,
  100,
  now()
)
on conflict (assessment_id, student_id) do update set
  score = excluded.score,
  max_score = excluded.max_score,
  submitted_at = coalesce(assessment_attempts.submitted_at, now());
