-- Migration: Allow trainers to view/manage courses and course enrollments,
-- grant messaging permissions for trainers, and ensure all approved students are enrolled.

begin;

-- 1. Policies for public.courses
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'courses' and policyname = 'Trainers view courses'
  ) then
    create policy "Trainers view courses"
      on public.courses for select to authenticated
      using ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'courses' and policyname = 'Trainers update courses'
  ) then
    create policy "Trainers update courses"
      on public.courses for update to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 2. Policies for public.course_enrollments
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_enrollments' and policyname = 'Trainers view course enrollments'
  ) then
    create policy "Trainers view course enrollments"
      on public.course_enrollments for select to authenticated
      using ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_enrollments' and policyname = 'Trainers manage course enrollments'
  ) then
    create policy "Trainers manage course enrollments"
      on public.course_enrollments for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 3. Policies for public.conversations and public.messages
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversations' and policyname = 'Trainers manage conversations'
  ) then
    create policy "Trainers manage conversations"
      on public.conversations for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages' and policyname = 'Trainers manage messages'
  ) then
    create policy "Trainers manage messages"
      on public.messages for all to authenticated
      using ((select public.is_trainer()))
      with check ((select public.is_trainer()));
  end if;
end $$;

-- 4. Ensure table permissions
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_enrollments to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- 5. Auto-enroll: If any approved student is currently not enrolled in any course,
-- enroll them in the primary/available course so they are properly registered.
insert into public.course_enrollments (course_id, student_id)
select c.id, p.id
from public.profiles p
cross join (
  select id from public.courses order by created_at asc limit 1
) c
where p.role = 'student'
  and p.is_approved = true
  and not exists (
    select 1 from public.course_enrollments ce where ce.student_id = p.id
  )
on conflict do nothing;

commit;
