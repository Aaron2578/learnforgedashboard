-- ==================== 20261030000000_student_portal.sql ====================
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'superuser')),
  created_at timestamptz not null default now()
);

create or replace function public.is_superuser()
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
      and role = 'superuser'
  );
$$;

revoke all on function public.is_superuser() from public;
grant execute on function public.is_superuser() to authenticated;

create unique index profiles_email_lower_idx on public.profiles (lower(email));
alter table public.profiles enable row level security;

create policy "Profiles are visible to their owner and superusers"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_superuser()));

grant select on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 150),
  description text not null default '',
  due_at timestamptz,
  published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  answer_text text not null default '',
  file_path text,
  submitted_at timestamptz not null default now(),
  grade numeric(5, 2) check (grade is null or grade between 0 and 100),
  feedback text,
  graded_at timestamptz,
  unique (assignment_id, student_id),
  check (length(trim(answer_text)) > 0 or file_path is not null),
  check (file_path is null or split_part(file_path, '/', 1) = student_id::text)
);

create index assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id);
create index assignment_submissions_student_idx on public.assignment_submissions (student_id);
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

create or replace function public.set_assignment_submission_time()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.student_id = (select auth.uid()) and not public.is_superuser() then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger set_assignment_submission_time
  before insert or update on public.assignment_submissions
  for each row execute procedure public.set_assignment_submission_time();

create policy "Students can view published assignments"
  on public.assignments for select to authenticated
  using (published or (select public.is_superuser()));
create policy "Superusers can create assignments"
  on public.assignments for insert to authenticated
  with check ((select public.is_superuser()) and created_by = (select auth.uid()));
create policy "Superusers can update assignments"
  on public.assignments for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
create policy "Superusers can delete assignments"
  on public.assignments for delete to authenticated
  using ((select public.is_superuser()));

create policy "Students see their submissions and superusers see all"
  on public.assignment_submissions for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_superuser()));
create policy "Students can submit their own work before the deadline"
  on public.assignment_submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and grade is null
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.published
        and (a.due_at is null or a.due_at > now())
    )
  );
create policy "Students can update their own ungraded submissions"
  on public.assignment_submissions for update to authenticated
  using (student_id = (select auth.uid()) and graded_at is null)
  with check (
    student_id = (select auth.uid())
    and grade is null
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.published
        and (a.due_at is null or a.due_at > now())
    )
  );
create policy "Superusers can grade submissions"
  on public.assignment_submissions for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant select on public.assignments, public.assignment_submissions to authenticated;
grant insert, update, delete on public.assignments to authenticated;
grant insert, update on public.assignment_submissions to authenticated;

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 150),
  description text not null default '',
  due_at timestamptz,
  published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  prompt text not null check (length(trim(prompt)) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index integer not null check (correct_index >= 0),
  points integer not null default 1 check (points between 1 and 100),
  sort_order integer not null default 0,
  check (correct_index < jsonb_array_length(options))
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null,
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0 and score <= max_score),
  submitted_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create index assessment_questions_order_idx on public.assessment_questions (assessment_id, sort_order);
create index assessment_attempts_student_idx on public.assessment_attempts (student_id);
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_attempts enable row level security;

create policy "Students can view published tests"
  on public.assessments for select to authenticated
  using (published or (select public.is_superuser()));
create policy "Superusers can create tests"
  on public.assessments for insert to authenticated
  with check ((select public.is_superuser()) and created_by = (select auth.uid()));
create policy "Superusers can update tests"
  on public.assessments for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));
create policy "Superusers can delete tests"
  on public.assessments for delete to authenticated
  using ((select public.is_superuser()));

create policy "Superusers can manage test questions"
  on public.assessment_questions for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students see their own test attempts and superusers see all"
  on public.assessment_attempts for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_superuser()));

grant select on public.assessments, public.assessment_attempts to authenticated;
grant insert, update, delete on public.assessments, public.assessment_questions to authenticated;
grant select, insert on public.assessment_attempts to authenticated;
revoke all on public.assessment_questions from anon, authenticated;
grant insert, update, delete on public.assessment_questions to authenticated;

create view public.student_assessment_questions
with (security_barrier = true)
as
  select q.id, q.assessment_id, q.prompt, q.options, q.points, q.sort_order
  from public.assessment_questions q
  join public.assessments a on a.id = q.assessment_id
  where a.published;

grant select on public.student_assessment_questions to authenticated;

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
  if v_student_id is null or public.is_superuser() then
    raise exception 'A student account is required to submit a test.';
  end if;

  if jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Test answers must be submitted as an object.';
  end if;

  if not exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id
      and a.published
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

revoke all on function public.submit_assessment(uuid, jsonb) from public;
grant execute on function public.submit_assessment(uuid, jsonb) to authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (length(trim(subject)) between 1 and 150),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 10000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Students and superusers can view conversations"
  on public.conversations for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_superuser()));
create policy "Students can start their own conversations"
  on public.conversations for insert to authenticated
  with check (student_id = (select auth.uid()) and not (select public.is_superuser()));

create policy "Conversation participants can read messages"
  on public.messages for select to authenticated
  using (
    (select public.is_superuser())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.student_id = (select auth.uid())
    )
  );
create policy "Conversation participants can send messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (select public.is_superuser())
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.student_id = (select auth.uid())
      )
    )
  );
create policy "Recipients can mark messages as read"
  on public.messages for update to authenticated
  using (
    (select public.is_superuser())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.student_id = (select auth.uid())
        and sender_id <> (select auth.uid())
    )
  )
  with check (
    (select public.is_superuser())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.student_id = (select auth.uid())
        and sender_id <> (select auth.uid())
    )
  );

grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-files',
  'assignment-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Students upload their own assignment files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Students and superusers can read assignment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_superuser())
    )
  );
create policy "Students can replace their own assignment files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'assignment-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Students and superusers can remove assignment files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_superuser())
    )
  );

-- ==================== 20261031000000_remove_sample_portal_content.sql ====================
delete from public.assignments
where id = 'a1000000-0000-4000-8000-000000000001';

delete from public.assessments
where id = 'a2000000-0000-4000-8000-000000000001';

-- ==================== 20261101000000_student_management.sql ====================
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

-- ==================== 20261101000001_grant_service_role_permissions.sql ====================
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;


-- ==================== 20261101000002_auto_confirm_signup.sql ====================
create or replace function public.auto_confirm_student_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_before_insert on auth.users;
create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row
  execute function public.auto_confirm_student_signup();


-- ==================== 20261101000003_auto_assign_approved_students.sql ====================
-- Automatically assign newly approved students to existing published assignments and assessments
create or replace function public.auto_assign_approved_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'student' and new.is_approved = true and (old.is_approved is null or old.is_approved = false) then
    insert into public.assignment_recipients (assignment_id, student_id)
    select a.id, new.id
    from public.assignments a
    where a.published
    on conflict do nothing;

    insert into public.assessment_recipients (assessment_id, student_id)
    select a.id, new.id
    from public.assessments a
    where a.published
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_student_approval_assign_coursework on public.profiles;
create trigger on_student_approval_assign_coursework
  after update on public.profiles
  for each row
  execute function public.auto_assign_approved_student();

-- ==================== 20261102000000_database_storage_stats.sql ====================
-- Function to get database size, file storage size, quota, and available space for superusers
create or replace function public.get_database_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_db_size bigint;
  v_quota bigint := 524288000; -- 500 MB (Supabase default free database storage limit)
  v_file_size bigint;
  v_available bigint;
  v_pct numeric;
begin
  -- Only authenticated superusers (or system/postgres role) can access
  if auth.uid() is not null and not (select public.is_superuser()) then
    raise exception 'Superuser access required.';
  end if;

  v_db_size := pg_database_size(current_database());
  v_available := greatest(0, v_quota - v_db_size);
  v_pct := round((v_db_size::numeric / v_quota::numeric) * 100, 1);
  
  select coalesce(sum((metadata->>'size')::bigint), 0)
  into v_file_size
  from storage.objects;

  return jsonb_build_object(
    'db_used_bytes', v_db_size,
    'db_used_pretty', pg_size_pretty(v_db_size),
    'db_quota_bytes', v_quota,
    'db_quota_pretty', pg_size_pretty(v_quota),
    'db_available_bytes', v_available,
    'db_available_pretty', pg_size_pretty(v_available),
    'db_used_percent', v_pct,
    'file_used_bytes', v_file_size,
    'file_used_pretty', pg_size_pretty(v_file_size)
  );
end;
$$;

revoke all on function public.get_database_storage_stats() from public;
grant execute on function public.get_database_storage_stats() to authenticated;

-- ==================== 20261102000001_secure_drive_and_download_requests.sql ====================
-- Migration: Secure Drive Materials, Test Links & Student Download Approval Workflow
-- 1. Add file attachments support to assessments
alter table public.assessments
  add column if not exists file_path text,
  add column if not exists file_name text;

-- 2. Create course_materials table for Drive links and uploaded files
create table if not exists public.course_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  category text not null default 'Document' check (category in ('Document', 'PDF', 'Test / Assessment', 'Lecture Notes', 'Study Guide', 'Other')),
  course_id uuid references public.courses (id) on delete set null,
  file_path text,
  file_name text,
  file_size bigint default 0,
  file_type text default 'application/pdf',
  drive_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (file_path is not null or drive_url is not null)
);

create index if not exists course_materials_course_idx on public.course_materials (course_id);
create index if not exists course_materials_created_idx on public.course_materials (created_at desc);

-- 3. Create download_requests table for individual student download permission & revocation
create table if not exists public.download_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid references public.course_materials (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  reason text default '',
  admin_notes text default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (material_id is not null or assessment_id is not null)
);

create unique index if not exists download_requests_student_material_idx
  on public.download_requests (student_id, material_id)
  where material_id is not null;

create unique index if not exists download_requests_student_assessment_idx
  on public.download_requests (student_id, assessment_id)
  where assessment_id is not null;

create index if not exists download_requests_student_idx on public.download_requests (student_id);
create index if not exists download_requests_status_idx on public.download_requests (status);

-- 4. Enable RLS
alter table public.course_materials enable row level security;
alter table public.download_requests enable row level security;

-- Policies for course_materials
create policy "Superusers manage all course materials"
  on public.course_materials for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Approved students can view course materials"
  on public.course_materials for select to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and (
        course_id is null
        or exists (
          select 1 from public.course_enrollments e
          where e.course_id = course_materials.course_id
            and e.student_id = (select auth.uid())
        )
      )
    )
  );

-- Policies for download_requests
create policy "Superusers manage all download requests"
  on public.download_requests for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students view their own download requests"
  on public.download_requests for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_superuser()));

create policy "Approved students can submit download requests"
  on public.download_requests for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and status = 'pending'
  );

-- 5. RPC Functions for safe download request workflow
create or replace function public.request_download(
  p_material_id uuid default null,
  p_assessment_id uuid default null,
  p_reason text default ''
)
returns public.download_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid := auth.uid();
  v_rec public.download_requests;
begin
  if v_student_id is null then
    raise exception 'You must be signed in to request a download.';
  end if;
  if not (select public.is_student_approved()) and not (select public.is_superuser()) then
    raise exception 'Your account is pending administrator approval.';
  end if;
  if p_material_id is null and p_assessment_id is null then
    raise exception 'Specify a material or assessment to request.';
  end if;

  if p_material_id is not null then
    insert into public.download_requests (student_id, material_id, reason, status, requested_at)
    values (v_student_id, p_material_id, coalesce(p_reason, ''), 'pending', now())
    on conflict (student_id, material_id) where material_id is not null
    do update set
      status = 'pending',
      reason = coalesce(nullif(excluded.reason, ''), public.download_requests.reason),
      requested_at = now()
    returning * into v_rec;
  else
    insert into public.download_requests (student_id, assessment_id, reason, status, requested_at)
    values (v_student_id, p_assessment_id, coalesce(p_reason, ''), 'pending', now())
    on conflict (student_id, assessment_id) where assessment_id is not null
    do update set
      status = 'pending',
      reason = coalesce(nullif(excluded.reason, ''), public.download_requests.reason),
      requested_at = now()
    returning * into v_rec;
  end if;

  return v_rec;
end;
$$;

create or replace function public.review_download_request(
  p_request_id uuid,
  p_status text,
  p_notes text default ''
)
returns public.download_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec public.download_requests;
begin
  if not (select public.is_superuser()) then
    raise exception 'Superuser access required.';
  end if;

  if p_status not in ('approved', 'rejected', 'revoked', 'pending') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.download_requests
  set status = p_status,
      admin_notes = coalesce(p_notes, admin_notes),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_request_id
  returning * into v_rec;

  if not found then
    raise exception 'Download request not found.';
  end if;

  return v_rec;
end;
$$;

revoke all on function public.request_download(uuid, uuid, text) from public;
grant execute on function public.request_download(uuid, uuid, text) to authenticated;

revoke all on function public.review_download_request(uuid, text, text) from public;
grant execute on function public.review_download_request(uuid, text, text) to authenticated;

-- Grants
grant select on public.course_materials to authenticated;
grant insert, update, delete on public.course_materials to authenticated;

grant select on public.download_requests to authenticated;
grant insert, update, delete on public.download_requests to authenticated;

-- 6. Storage bucket for course materials
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage object policies
drop policy if exists "Superusers manage course materials bucket" on storage.objects;
create policy "Superusers manage course materials bucket"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'course-materials'
    and (select public.is_superuser())
  )
  with check (
    bucket_id = 'course-materials'
    and (select public.is_superuser())
  );

drop policy if exists "Approved students can view course materials" on storage.objects;
create policy "Approved students can view course materials"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      (select public.is_student_approved())
      or (select public.is_superuser())
    )
  );


-- ==================== 20261102000002_courses_enhancements.sql ====================
-- Migration: Courses Enhancements with Instructor, Department, Schedule, Room
alter table public.courses
  add column if not exists instructor text default '',
  add column if not exists department text default '',
  add column if not exists schedule text default '',
  add column if not exists room text default '';

-- Enable updating courses for superusers
create policy "Superusers can update course details"
  on public.courses for update to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

grant update on public.courses to authenticated;


-- ==================== 20261102000003_enable_realtime.sql ====================
-- Migration: Enable Supabase Realtime for instant two-way updates between Admin & Student
begin;

-- Set replica identity full so update & delete events carry complete row data
alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.assignments replica identity full;
alter table public.assignment_submissions replica identity full;
alter table public.assignment_recipients replica identity full;
alter table public.assessments replica identity full;
alter table public.assessment_attempts replica identity full;
alter table public.assessment_recipients replica identity full;
alter table public.courses replica identity full;
alter table public.course_enrollments replica identity full;
alter table public.course_materials replica identity full;
alter table public.download_requests replica identity full;
alter table public.attendance_records replica identity full;
alter table public.student_notes replica identity full;
alter table public.profiles replica identity full;
alter table public.student_notifications replica identity full;

-- Add tables to supabase_realtime publication
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.assignment_submissions;
alter publication supabase_realtime add table public.assignment_recipients;
alter publication supabase_realtime add table public.assessments;
alter publication supabase_realtime add table public.assessment_attempts;
alter publication supabase_realtime add table public.assessment_recipients;
alter publication supabase_realtime add table public.courses;
alter publication supabase_realtime add table public.course_enrollments;
alter publication supabase_realtime add table public.course_materials;
alter publication supabase_realtime add table public.download_requests;
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.student_notes;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.student_notifications;

commit;


-- ==================== 20261102000004_record_exam_attempts.sql ====================
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


-- ==================== 20261102000005_record_amritha_attempt.sql ====================
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


-- ==================== 20261102000006_attendance_calendar_and_student_timing.sql ====================
-- Migration: 20261102000006_attendance_calendar_and_student_timing.sql
-- 1. Add timing column to student profiles so every student can have custom class/batch timing
alter table public.profiles
  add column if not exists timing text default '10:00 AM - 12:00 PM';

-- Set default timing for Amritha and existing students
update public.profiles
set timing = '10:00 AM - 12:00 PM'
where role = 'student' and (timing is null or timing = '');

-- 2. Add show_marks permission toggle to assessments table
alter table public.assessments
  add column if not exists show_marks boolean not null default false;

-- 3. Clean up and set departments for IT and SAP courses
update public.courses
set department = 'IT'
where code in ('TMIT01', 'TMIT02', 'TMIT03') or name ilike '%JAVA%' or name ilike '%PYTHON%';

update public.courses
set department = 'SAP'
where code in ('TMSAP01') or name ilike '%SAP%' or name ilike '%FICO%';


-- ==================== 20261102000007_fix_profiles_permissions.sql ====================
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

