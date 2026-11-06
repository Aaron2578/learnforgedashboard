-- Migration: Fix infinite recursion in courses and course_enrollments RLS policies
-- Breaks circular RLS evaluation between public.courses and public.course_enrollments
-- by using SECURITY DEFINER helper functions that bypass RLS during existence checks.

begin;

-- 1. Helper function: check if a student is enrolled in a course without triggering RLS
create or replace function public.is_student_enrolled_in_course(p_course_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.course_enrollments
    where course_id = p_course_id
      and student_id = p_student_id
  );
$$;

revoke all on function public.is_student_enrolled_in_course(uuid, uuid) from public;
grant execute on function public.is_student_enrolled_in_course(uuid, uuid) to anon, authenticated, service_role;

-- 2. Helper function: check if a trainer owns or instructs a course without triggering RLS
create or replace function public.is_trainer_for_course(p_course_id uuid, p_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = p_course_id
      and (
        c.trainer_id = p_trainer_id
        or exists (
          select 1
          from public.profiles p
          where p.id = p_trainer_id
            and (
              lower(trim(c.instructor)) = lower(trim(p.full_name))
              or lower(trim(c.instructor)) = lower(trim(p.email))
              or position(lower(trim(p.full_name)) in lower(trim(c.instructor))) > 0
              or position(lower(trim(c.instructor)) in lower(trim(p.full_name))) > 0
            )
        )
      )
  );
$$;

revoke all on function public.is_trainer_for_course(uuid, uuid) from public;
grant execute on function public.is_trainer_for_course(uuid, uuid) to anon, authenticated, service_role;

-- 3. Reset and recreate policies on public.courses
drop policy if exists "Students see their enrolled courses" on public.courses;
drop policy if exists "Trainers view courses" on public.courses;
drop policy if exists "Trainers update courses" on public.courses;
drop policy if exists "Superusers manage courses" on public.courses;

create policy "Superusers manage courses"
  on public.courses
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

-- Students only see courses they are enrolled in (via SECURITY DEFINER helper to avoid RLS loop)
create policy "Students see their enrolled courses"
  on public.courses
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and public.is_student_enrolled_in_course(id, (select auth.uid()))
    )
  );

-- Trainers see courses where they are assigned as instructor / trainer_id
create policy "Trainers view courses"
  on public.courses
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
              or position(lower(trim(p.full_name)) in lower(trim(courses.instructor))) > 0
              or position(lower(trim(courses.instructor)) in lower(trim(p.full_name))) > 0
            )
        )
      )
    )
  );

-- Trainers can update course details for their own courses
create policy "Trainers update courses"
  on public.courses
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
              or position(lower(trim(p.full_name)) in lower(trim(courses.instructor))) > 0
              or position(lower(trim(courses.instructor)) in lower(trim(p.full_name))) > 0
            )
        )
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
              or position(lower(trim(p.full_name)) in lower(trim(courses.instructor))) > 0
              or position(lower(trim(courses.instructor)) in lower(trim(p.full_name))) > 0
            )
        )
      )
    )
  );

-- 4. Reset and recreate policies on public.course_enrollments
drop policy if exists "Students see their own course enrollments" on public.course_enrollments;
drop policy if exists "Superusers manage course enrollments" on public.course_enrollments;
drop policy if exists "Trainers view course enrollments" on public.course_enrollments;
drop policy if exists "Trainers manage course enrollments" on public.course_enrollments;
drop policy if exists "Trainers can view course enrollments" on public.course_enrollments;
drop policy if exists "Trainers can manage course enrollments" on public.course_enrollments;

create policy "Superusers manage course enrollments"
  on public.course_enrollments
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students see their own course enrollments"
  on public.course_enrollments
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Trainers view course enrollments"
  on public.course_enrollments
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        public.is_trainer_for_course(course_id, (select auth.uid()))
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = course_enrollments.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = course_enrollments.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

create policy "Trainers manage course enrollments"
  on public.course_enrollments
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        public.is_trainer_for_course(course_id, (select auth.uid()))
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = course_enrollments.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = course_enrollments.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        public.is_trainer_for_course(course_id, (select auth.uid()))
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = course_enrollments.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = course_enrollments.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

-- 5. Update assignment policies to use public.is_trainer_for_course to prevent any indirect recursion
drop policy if exists "Trainers view assignments" on public.assignments;
drop policy if exists "Trainers manage assignments" on public.assignments;

create policy "Trainers view assignments"
  on public.assignments
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        created_by = (select auth.uid())
        or trainer_id = (select auth.uid())
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
      )
    )
  );

create policy "Trainers manage assignments"
  on public.assignments
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        created_by = (select auth.uid())
        or trainer_id = (select auth.uid())
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        created_by = (select auth.uid())
        or trainer_id = (select auth.uid())
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
      )
    )
  );

-- 6. Update assignment_recipients policy
drop policy if exists "Trainers manage assignment targeting" on public.assignment_recipients;

create policy "Trainers manage assignment targeting"
  on public.assignment_recipients
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_recipients.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or (a.course_id is not null and public.is_trainer_for_course(a.course_id, (select auth.uid())))
            )
        )
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = assignment_recipients.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = assignment_recipients.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_recipients.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or (a.course_id is not null and public.is_trainer_for_course(a.course_id, (select auth.uid())))
            )
        )
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = assignment_recipients.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = assignment_recipients.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

-- 7. Update assignment_submissions policies
drop policy if exists "Trainers view assignment submissions" on public.assignment_submissions;
drop policy if exists "Trainers grade assignment submissions" on public.assignment_submissions;

create policy "Trainers view assignment submissions"
  on public.assignment_submissions
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_submissions.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or (a.course_id is not null and public.is_trainer_for_course(a.course_id, (select auth.uid())))
            )
        )
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = assignment_submissions.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = assignment_submissions.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

create policy "Trainers grade assignment submissions"
  on public.assignment_submissions
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_submissions.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or (a.course_id is not null and public.is_trainer_for_course(a.course_id, (select auth.uid())))
            )
        )
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = assignment_submissions.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = assignment_submissions.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_submissions.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or (a.course_id is not null and public.is_trainer_for_course(a.course_id, (select auth.uid())))
            )
        )
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = assignment_submissions.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = assignment_submissions.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

-- 8. Ensure proper grants
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_enrollments to authenticated;
grant select on public.courses to anon;
grant select on public.course_enrollments to anon;

commit;
