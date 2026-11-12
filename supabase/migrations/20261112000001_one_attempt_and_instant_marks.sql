-- Migration: Enforce explicit single-attempt message and ensure marks show immediately to teacher & student on test submission
begin;

-- 1. Default new assessments to show marks to both teacher and student upon submission
alter table public.assessments
  alter column show_marks set default true;

update public.assessments
set show_marks = true
where external_url is null and show_marks = false;

-- 2. Update submit_assessment to return an explicit single-attempt error if already submitted
create or replace function public.submit_assessment(
  p_assessment_id uuid,
  p_answers jsonb,
  p_proctoring jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid := auth.uid();
  v_assessment public.assessments;
  v_question_count integer;
  v_invalid_answers integer;
  v_score integer;
  v_max_score integer;
  v_percentage numeric(5,2);
  v_passed boolean;
  v_attempt public.assessment_attempts;
  v_proctoring jsonb := coalesce(p_proctoring, '{}'::jsonb);
  v_student_name text;
  v_roll_number text;
  v_time_taken integer;
  v_tab_switches integer;
  v_camera_status text;
  v_submission_reason text;
  v_proctoring_log jsonb;
  v_review_questions jsonb := '[]'::jsonb;
  v_can_show_marks boolean;
begin
  if v_student_id is null or public.is_superuser() or public.is_trainer() then
    raise exception 'A student account is required to submit a test.';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Test answers must be submitted as an object.';
  end if;

  -- Enforce strict one-time test attendance
  if exists (
    select 1 from public.assessment_attempts att
    where att.assessment_id = p_assessment_id
      and att.student_id = v_student_id
  ) then
    raise exception 'You have already attended and submitted this test. Only one attempt is allowed.';
  end if;

  select * into v_assessment
  from public.assessments a
  where a.id = p_assessment_id
    and a.published
    and (a.due_at is null or a.due_at > now());

  if v_assessment.id is null then
    raise exception 'This test is unavailable or past its deadline.';
  end if;

  if exists (select 1 from public.assessment_recipients r where r.assessment_id = p_assessment_id)
     and not exists (
       select 1 from public.assessment_recipients r
       where r.assessment_id = p_assessment_id and r.student_id = v_student_id
     ) then
    raise exception 'You are not assigned to this assessment.';
  end if;

  select count(*) into v_question_count
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  if v_question_count = 0 then
    raise exception 'This test has no questions configured.';
  end if;

  select count(*) into v_invalid_answers
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id
    and (p_answers ? q.id::text)
    and jsonb_typeof(p_answers -> q.id::text) <> 'null'
    and (
      coalesce(p_answers ->> q.id::text, '') !~ '^[0-9]+$'
      or case
        when coalesce(p_answers ->> q.id::text, '') ~ '^[0-9]+$'
          then (p_answers ->> q.id::text)::integer < 0
            or (p_answers ->> q.id::text)::integer >= jsonb_array_length(q.options)
        else true
      end
    );

  if v_invalid_answers > 0 then
    raise exception 'One or more answers are invalid.';
  end if;

  select
    coalesce(sum(q.points) filter (
      where (p_answers ? q.id::text)
        and jsonb_typeof(p_answers -> q.id::text) <> 'null'
        and coalesce(p_answers ->> q.id::text, '') ~ '^[0-9]+$'
        and q.correct_index = (p_answers ->> q.id::text)::integer
    ), 0)::integer,
    greatest(coalesce(sum(q.points), 0), 1)::integer
  into v_score, v_max_score
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  v_percentage := round((v_score::numeric / v_max_score::numeric) * 100.0, 2);
  v_passed := v_percentage >= coalesce(v_assessment.passing_percentage, 50);

  v_student_name := nullif(trim(coalesce(v_proctoring ->> 'student_name', '')), '');
  v_roll_number := nullif(trim(coalesce(v_proctoring ->> 'roll_number', '')), '');
  v_time_taken := case
    when coalesce(v_proctoring ->> 'time_taken_seconds', '') ~ '^[0-9]+$'
      then (v_proctoring ->> 'time_taken_seconds')::integer
    else 0
  end;
  v_tab_switches := case
    when coalesce(v_proctoring ->> 'tab_switch_count', '') ~ '^[0-9]+$'
      then (v_proctoring ->> 'tab_switch_count')::integer
    else 0
  end;
  v_camera_status := coalesce(nullif(trim(v_proctoring ->> 'camera_status'), ''), 'Not Required');
  v_submission_reason := coalesce(nullif(trim(v_proctoring ->> 'submission_reason'), ''), 'manual');
  v_proctoring_log := case
    when jsonb_typeof(v_proctoring -> 'proctoring_log') = 'array'
      then v_proctoring -> 'proctoring_log'
    else '[]'::jsonb
  end;

  insert into public.assessment_attempts (
    assessment_id,
    student_id,
    answers,
    score,
    max_score,
    student_name,
    roll_number,
    time_taken_seconds,
    tab_switch_count,
    camera_status,
    submission_reason,
    proctoring_log,
    percentage,
    passed,
    status,
    completed_at
  )
  values (
    p_assessment_id,
    v_student_id,
    p_answers,
    v_score,
    v_max_score,
    v_student_name,
    v_roll_number,
    v_time_taken,
    v_tab_switches,
    v_camera_status,
    v_submission_reason,
    v_proctoring_log,
    v_percentage,
    v_passed,
    'Completed',
    now()
  )
  returning * into v_attempt;

  v_can_show_marks := coalesce(v_assessment.show_marks, true) or v_assessment.external_url is null;

  if v_can_show_marks then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'external_id', q.external_id,
        'prompt', q.prompt,
        'options', q.options,
        'correct_index', q.correct_index,
        'explanation', q.explanation,
        'points', q.points,
        'sort_order', q.sort_order
      ) order by q.sort_order, q.id
    ), '[]'::jsonb)
    into v_review_questions
    from public.assessment_questions q
    where q.assessment_id = p_assessment_id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assessment_id', v_attempt.assessment_id,
    'answers', v_attempt.answers,
    'score', v_attempt.score,
    'max_score', v_attempt.max_score,
    'percentage', v_attempt.percentage,
    'passed', v_attempt.passed,
    'passing_percentage', coalesce(v_assessment.passing_percentage, 50),
    'show_marks', v_can_show_marks,
    'student_name', v_attempt.student_name,
    'time_taken_seconds', v_attempt.time_taken_seconds,
    'tab_switch_count', v_attempt.tab_switch_count,
    'camera_status', v_attempt.camera_status,
    'submission_reason', v_attempt.submission_reason,
    'proctoring_log', v_attempt.proctoring_log,
    'submitted_at', v_attempt.submitted_at,
    'review_questions', v_review_questions
  );
end;
$$;

revoke all on function public.submit_assessment(uuid, jsonb, jsonb) from public;
grant execute on function public.submit_assessment(uuid, jsonb, jsonb) to authenticated;

commit;
