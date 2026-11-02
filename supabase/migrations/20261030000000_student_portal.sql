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
