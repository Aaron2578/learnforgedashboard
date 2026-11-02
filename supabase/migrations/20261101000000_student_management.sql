alter table public.profiles
  add column is_approved boolean not null default false;

update public.profiles
set is_approved = true
where role = 'superuser';

create or replace function public.is_student_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'student'
      and is_approved
  );
$$;

revoke all on function public.is_student_approved() from public;
grant execute on function public.is_student_approved() to authenticated;

create policy "Superusers can approve student profiles"
  on public.profiles for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
grant update (is_approved) on public.profiles to authenticated;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  code text not null check (length(trim(code)) between 1 and 40),
  description text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index courses_code_lower_idx on public.courses (lower(code));

create table public.course_enrollments (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;

create policy "Students see their enrolled courses"
  on public.courses for select to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.course_enrollments e
        where e.course_id = id and e.student_id = (select auth.uid())
      )
    )
  );
create policy "Superusers manage courses"
  on public.courses for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
create policy "Students see their own course enrollments"
  on public.course_enrollments for select to authenticated
  using ((select public.is_superuser()) or (student_id = (select auth.uid()) and (select public.is_student_approved())));
create policy "Superusers manage course enrollments"
  on public.course_enrollments for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant select, insert, update, delete on public.courses, public.course_enrollments to authenticated;

drop policy "Students see their submissions and superusers see all" on public.assignment_submissions;
create policy "Approved students see their submissions and superusers see all"
  on public.assignment_submissions for select to authenticated
  using ((select public.is_superuser()) or (student_id = (select auth.uid()) and (select public.is_student_approved())));

drop policy "Students see their own test attempts and superusers see all" on public.assessment_attempts;
create policy "Approved students see their own test attempts and superusers see all"
  on public.assessment_attempts for select to authenticated
  using ((select public.is_superuser()) or (student_id = (select auth.uid()) and (select public.is_student_approved())));

create table public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 150),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.student_notes enable row level security;
create policy "Students see notes assigned to them"
  on public.student_notes for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Superusers manage student notes"
  on public.student_notes for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
grant select, insert, update, delete on public.student_notes to authenticated;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('present', 'late', 'absent')),
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index attendance_records_student_day_course_idx
  on public.attendance_records (student_id, attendance_date, coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.attendance_records enable row level security;
create policy "Students see their own attendance"
  on public.attendance_records for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Superusers manage attendance"
  on public.attendance_records for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
grant select, insert, update, delete on public.attendance_records to authenticated;

create table public.assignment_recipients (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (assignment_id, student_id)
);
create table public.assessment_recipients (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (assessment_id, student_id)
);
create index assignment_recipients_student_idx on public.assignment_recipients (student_id);
create index assessment_recipients_student_idx on public.assessment_recipients (student_id);
alter table public.assignment_recipients enable row level security;
alter table public.assessment_recipients enable row level security;

create policy "Students see their assignment targeting"
  on public.assignment_recipients for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Superusers manage assignment targeting"
  on public.assignment_recipients for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
create policy "Students see their test targeting"
  on public.assessment_recipients for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Superusers manage test targeting"
  on public.assessment_recipients for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
grant select, insert, delete on public.assignment_recipients, public.assessment_recipients to authenticated;

alter table public.assessments
  add column external_url text,
  add constraint assessments_external_url_valid check (
    external_url is null or external_url ~ '^https://'
  );

insert into public.assignment_recipients (assignment_id, student_id)
select a.id, p.id
from public.assignments a
cross join public.profiles p
where a.published
  and p.role = 'student'
  and p.is_approved
  and not exists (
    select 1
    from public.assignment_recipients r
    where r.assignment_id = a.id and r.student_id = p.id
  );

insert into public.assessment_recipients (assessment_id, student_id)
select a.id, p.id
from public.assessments a
cross join public.profiles p
where a.published
  and p.role = 'student'
  and p.is_approved
  and not exists (
    select 1
    from public.assessment_recipients r
    where r.assessment_id = a.id and r.student_id = p.id
  );

drop policy "Students can view published assignments" on public.assignments;
create policy "Students can view assigned published assignments"
  on public.assignments for select to authenticated
  using (
    (select public.is_superuser())
    or (
      published
      and (select public.is_student_approved())
      and exists (
        select 1 from public.assignment_recipients r
        where r.assignment_id = id and r.student_id = (select auth.uid())
      )
    )
  );

drop policy "Students can view published tests" on public.assessments;
create policy "Students can view assigned published tests"
  on public.assessments for select to authenticated
  using (
    (select public.is_superuser())
    or (
      published
      and (select public.is_student_approved())
      and exists (
        select 1 from public.assessment_recipients r
        where r.assessment_id = id and r.student_id = (select auth.uid())
      )
    )
  );

drop policy "Students can submit their own work before the deadline" on public.assignment_submissions;
create policy "Approved students submit assigned work before the deadline"
  on public.assignment_submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and grade is null
    and exists (
      select 1 from public.assignments a
      join public.assignment_recipients r on r.assignment_id = a.id
      where a.id = assignment_id
        and r.student_id = (select auth.uid())
        and a.published
        and (a.due_at is null or a.due_at > now())
    )
  );
drop policy "Students can update their own ungraded submissions" on public.assignment_submissions;
create policy "Approved students update their own ungraded submissions"
  on public.assignment_submissions for update to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()) and graded_at is null)
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and grade is null
    and exists (
      select 1 from public.assignments a
      join public.assignment_recipients r on r.assignment_id = a.id
      where a.id = assignment_id
        and r.student_id = (select auth.uid())
        and a.published
        and (a.due_at is null or a.due_at > now())
    )
  );

create or replace view public.student_assessment_questions
with (security_barrier = true)
as
  select q.id, q.assessment_id, q.prompt, q.options, q.points, q.sort_order
  from public.assessment_questions q
  join public.assessments a on a.id = q.assessment_id
  join public.assessment_recipients r on r.assessment_id = a.id
  where a.published
    and r.student_id = (select auth.uid())
    and (select public.is_student_approved());

create or replace function public.submit_assessment(p_assessment_id uuid, p_answers jsonb)
returns table (attempt_id uuid, score integer, max_score integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid := auth.uid();
  v_question_count integer;
  v_answer_count integer;
  v_invalid_answers integer;
  v_score integer;
  v_max_score integer;
  v_attempt_id uuid;
begin
  if v_student_id is null or not public.is_student_approved() then
    raise exception 'An approved student account is required to submit a test.';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Test answers must be submitted as an object.';
  end if;

  if not exists (
    select 1 from public.assessments a
    join public.assessment_recipients r on r.assessment_id = a.id
    where a.id = p_assessment_id
      and r.student_id = v_student_id
      and a.published
      and a.external_url is null
      and (a.due_at is null or a.due_at > now())
  ) then
    raise exception 'This test is unavailable or past its deadline.';
  end if;

  select count(*) into v_question_count
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  v_answer_count := jsonb_object_length(p_answers);
  if v_question_count = 0 or v_answer_count <> v_question_count then
    raise exception 'Answer every question before submitting.';
  end if;

  select count(*) into v_invalid_answers
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id
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
      where q.correct_index = (p_answers ->> q.id::text)::integer
    ), 0)::integer,
    coalesce(sum(q.points), 0)::integer
  into v_score, v_max_score
  from public.assessment_questions q
  where q.assessment_id = p_assessment_id;

  insert into public.assessment_attempts (assessment_id, student_id, answers, score, max_score)
  values (p_assessment_id, v_student_id, p_answers, v_score, v_max_score)
  returning id into v_attempt_id;

  return query select v_attempt_id, v_score, v_max_score;
end;
$$;

drop policy "Students can start their own conversations" on public.conversations;
drop policy "Students and superusers can view conversations" on public.conversations;
create policy "Approved students and superusers can view conversations"
  on public.conversations for select to authenticated
  using ((select public.is_superuser()) or (student_id = (select auth.uid()) and (select public.is_student_approved())));
create policy "Approved students can start their own conversations"
  on public.conversations for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.is_student_approved()));
drop policy "Conversation participants can read messages" on public.messages;
create policy "Approved conversation participants can read messages"
  on public.messages for select to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.student_id = (select auth.uid())
      )
    )
  );
drop policy "Conversation participants can send messages" on public.messages;
create policy "Approved conversation participants can send messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (select public.is_superuser())
      or (
        (select public.is_student_approved())
        and exists (
          select 1 from public.conversations c
          where c.id = conversation_id and c.student_id = (select auth.uid())
        )
      )
    )
  );
drop policy "Recipients can mark messages as read" on public.messages;
create policy "Approved recipients can mark messages as read"
  on public.messages for update to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.student_id = (select auth.uid())
          and sender_id <> (select auth.uid())
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.student_id = (select auth.uid())
          and sender_id <> (select auth.uid())
      )
    )
  );

create table public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 150),
  body text not null check (length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.student_notifications enable row level security;
create policy "Students see and update their own notifications"
  on public.student_notifications for select to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Students can mark their own notifications read"
  on public.student_notifications for update to authenticated
  using (student_id = (select auth.uid()) and (select public.is_student_approved()))
  with check (student_id = (select auth.uid()) and (select public.is_student_approved()));
create policy "Superusers manage student notifications"
  on public.student_notifications for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
grant select, insert, delete on public.student_notifications to authenticated;
grant update (read_at) on public.student_notifications to authenticated;

drop policy "Students upload their own assignment files" on storage.objects;
create policy "Approved students upload their own assignment files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_student_approved())
  );
drop policy "Students and superusers can read assignment files" on storage.objects;
create policy "Approved students and superusers can read assignment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      (select public.is_superuser())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.is_student_approved())
      )
    )
  );
drop policy "Students can replace their own assignment files" on storage.objects;
create policy "Approved students can replace their own assignment files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_student_approved())
  )
  with check (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_student_approved())
  );
drop policy "Students and superusers can remove assignment files" on storage.objects;
create policy "Approved students and superusers can remove assignment files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      (select public.is_superuser())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.is_student_approved())
      )
    )
  );
