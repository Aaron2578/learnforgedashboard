-- Migration: Strictly restrict courses and course_enrollments visibility and update access for trainers
begin;

-- 1. Ensure all courses have trainer_id populated by matching instructor name with trainer profiles
update public.courses c
set trainer_id = p.id
from public.profiles p
where p.role = 'trainer'
  and (
    c.trainer_id is null
    or c.trainer_id != p.id
  )
  and (
    lower(trim(p.full_name)) = lower(trim(c.instructor))
    or lower(trim(p.email)) = lower(trim(c.instructor))
    or position(lower(trim(p.full_name)) in lower(trim(c.instructor))) > 0
    or position(lower(trim(c.instructor)) in lower(trim(p.full_name))) > 0
  );

-- 2. Drop existing overly-permissive trainer policies on courses
drop policy if exists "Trainers view courses" on public.courses;
drop policy if exists "Trainers update courses" on public.courses;

-- 3. Create strictly-scoped trainer policies on courses
-- Trainers can only view courses where trainer_id = auth.uid() or instructor name matches
create policy "Trainers view courses"
  on public.courses
  for select
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
            )
        )
      )
    )
  );

-- Trainers can only update courses that belong to them
create policy "Trainers update courses"
  on public.courses
  for update
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
            )
        )
      )
    )
  )
  with check (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        trainer_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and (
              lower(trim(courses.instructor)) = lower(trim(p.full_name))
              or lower(trim(courses.instructor)) = lower(trim(p.email))
            )
        )
      )
    )
  );

-- 4. Drop and recreate course_enrollments trainer policies to strictly scope by course trainer
drop policy if exists "Trainers view course enrollments" on public.course_enrollments;
drop policy if exists "Trainers manage course enrollments" on public.course_enrollments;

create policy "Trainers view course enrollments"
  on public.course_enrollments
  for select
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        -- Enrollment is in a course taught by this trainer
        exists (
          select 1 from public.courses c
          where c.id = course_enrollments.course_id
            and (
              c.trainer_id = (select auth.uid())
              or exists (
                select 1 from public.profiles p
                where p.id = (select auth.uid())
                  and (
                    lower(trim(c.instructor)) = lower(trim(p.full_name))
                    or lower(trim(c.instructor)) = lower(trim(p.email))
                  )
              )
            )
        )
        -- Or student is explicitly assigned to this trainer
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
    (select is_superuser())
    or (
      (select is_trainer()) and (
        exists (
          select 1 from public.courses c
          where c.id = course_enrollments.course_id
            and (
              c.trainer_id = (select auth.uid())
              or exists (
                select 1 from public.profiles p
                where p.id = (select auth.uid())
                  and (
                    lower(trim(c.instructor)) = lower(trim(p.full_name))
                    or lower(trim(c.instructor)) = lower(trim(p.email))
                  )
              )
            )
        )
      )
    )
  );

commit;
