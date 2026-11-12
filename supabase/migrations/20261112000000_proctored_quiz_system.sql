-- Migration: Proctored Quiz & Exam System (Config, Question Explanations, Proctoring Logs, Instant Review RPC)
begin;

-- 1. Proctoring & Exam Settings on assessments
alter table public.assessments
  add column if not exists duration_minutes integer not null default 30,
  add column if not exists require_camera boolean not null default false,
  add column if not exists allow_camera_off boolean not null default false,
  add column if not exists track_tab_switches boolean not null default true,
  add column if not exists max_tab_switches integer not null default 3,
  add column if not exists passing_percentage integer not null default 50;

alter table public.assessments drop constraint if exists assessments_duration_minutes_check;
alter table public.assessments add constraint assessments_duration_minutes_check check (duration_minutes between 1 and 360);

alter table public.assessments drop constraint if exists assessments_max_tab_switches_check;
alter table public.assessments add constraint assessments_max_tab_switches_check check (max_tab_switches between 1 and 50);

alter table public.assessments drop constraint if exists assessments_passing_percentage_check;
alter table public.assessments add constraint assessments_passing_percentage_check check (passing_percentage between 1 and 100);

-- 2. Question metadata (custom external_id & optional explanation) on assessment_questions
alter table public.assessment_questions
  add column if not exists external_id text,
  add column if not exists explanation text not null default '';

alter table public.assessment_questions drop constraint if exists assessment_questions_prompt_check;
alter table public.assessment_questions add constraint assessment_questions_prompt_check check (length(trim(prompt)) between 1 and 4000);

-- 3. Proctoring log & candidate metadata on assessment_attempts
alter table public.assessment_attempts
  add column if not exists student_name text,
  add column if not exists roll_number text,
  add column if not exists time_taken_seconds integer not null default 0,
  add column if not exists tab_switch_count integer not null default 0,
  add column if not exists camera_status text not null default 'Not Required',
  add column if not exists submission_reason text not null default 'manual',
  add column if not exists proctoring_log jsonb not null default '[]'::jsonb,
  add column if not exists percentage numeric(5,2),
  add column if not exists passed boolean;

-- 4. Update student-facing question view (still strips correct_index and explanation!)
create or replace view public.student_assessment_questions
with (security_barrier = true)
as
  select
    q.id,
    q.assessment_id,
    q.prompt,
    q.options,
    q.points,
    q.sort_order,
    q.external_id
  from public.assessment_questions q
  join public.assessments a on a.id = q.assessment_id
  where a.published;

grant select on public.student_assessment_questions to authenticated;

-- 5. Replace submit_assessment to support partial answers (timer/violation auto-submit),
--    store proctoring telemetry, compute pass/fail, and return full review when show_marks is enabled.
drop function if exists public.submit_assessment(uuid, jsonb);
drop function if exists public.submit_assessment(uuid, jsonb, jsonb);

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
begin
  if v_student_id is null or public.is_superuser() or public.is_trainer() then
    raise exception 'A student account is required to submit a test.';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Test answers must be submitted as an object.';
  end if;

  select * into v_assessment
  from public.assessments a
  where a.id = p_assessment_id
    and a.published
    and (a.due_at is null or a.due_at > now());

  if v_assessment.id is null then
    raise exception 'This test is unavailable or past its deadline.';
  end if;

  -- Check recipient targeting if explicit recipients exist for this assessment
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

  -- Validate only provided answers; unanswered questions simply earn 0 points
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

  if coalesce(v_assessment.show_marks, false) then
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
    'show_marks', coalesce(v_assessment.show_marks, false),
    'student_name', v_attempt.student_name,
    'roll_number', v_attempt.roll_number,
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

-- 6. Secure RPC to fetch post-submission Answer Review (with correct answers & explanations)
create or replace function public.get_assessment_review(p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_staff boolean := public.is_superuser() or public.is_trainer();
  v_assessment public.assessments;
  v_attempt public.assessment_attempts;
  v_questions jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_assessment
  from public.assessments a
  where a.id = p_assessment_id;

  if v_assessment.id is null then
    raise exception 'Assessment not found.';
  end if;

  if not v_is_staff then
    select * into v_attempt
    from public.assessment_attempts att
    where att.assessment_id = p_assessment_id
      and att.student_id = v_user_id;

    if v_attempt.id is null then
      raise exception 'Complete the assessment before viewing the answer review.';
    end if;
  end if;

  if v_is_staff or coalesce(v_assessment.show_marks, false) then
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
    into v_questions
    from public.assessment_questions q
    where q.assessment_id = p_assessment_id;
  end if;

  return jsonb_build_object(
    'assessment', jsonb_build_object(
      'id', v_assessment.id,
      'title', v_assessment.title,
      'description', v_assessment.description,
      'duration_minutes', v_assessment.duration_minutes,
      'passing_percentage', coalesce(v_assessment.passing_percentage, 50),
      'show_marks', coalesce(v_assessment.show_marks, false)
    ),
    'attempt', case when v_attempt.id is not null then to_jsonb(v_attempt) else null end,
    'show_marks', coalesce(v_assessment.show_marks, false) or v_is_staff,
    'questions', v_questions
  );
end;
$$;

revoke all on function public.get_assessment_review(uuid) from public;
grant execute on function public.get_assessment_review(uuid) to authenticated;

commit;
