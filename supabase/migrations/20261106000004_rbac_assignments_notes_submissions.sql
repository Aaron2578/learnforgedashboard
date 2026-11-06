-- Migration: Comprehensive RBAC support for Notes, Assignments, Submissions, Tests, and Attendance
begin;

-- 1. Ensure columns on student_notes
alter table public.student_notes
  add column if not exists drive_url text,
  add column if not exists updated_at timestamptz default now();

-- 2. Ensure columns on assignments
alter table public.assignments
  add column if not exists course_id uuid references public.courses (id) on delete set null,
  add column if not exists trainer_id uuid references public.profiles (id) on delete set null,
  add column if not exists total_marks numeric default 100;

-- 3. Ensure columns on assignment_submissions (flexible file or link, status)
alter table public.assignment_submissions
  add column if not exists submission_type text default 'File',
  add column if not exists submission_link text,
  add column if not exists status text default 'Completed';

-- 4. Ensure columns on assessments (Tests)
alter table public.assessments
  add column if not exists trainer_id uuid references public.profiles (id) on delete set null,
  add column if not exists total_marks numeric default 100;

-- 5. Ensure columns on assessment_attempts
alter table public.assessment_attempts
  add column if not exists status text default 'Completed',
  add column if not exists completed_at timestamptz default now();

-- 6. Permissions on tables
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.assignment_recipients to authenticated;
grant select, insert, update, delete on public.assignment_submissions to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select, insert, update, delete on public.assessment_recipients to authenticated;
grant select, insert, update, delete on public.assessment_attempts to authenticated;

-- 7. Policies for assignments
drop policy if exists "Trainers view assignments" on public.assignments;
drop policy if exists "Trainers manage assignments" on public.assignments;

create policy "Trainers view assignments"
  on public.assignments
  for select
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        created_by = (select auth.uid())
        or trainer_id = (select auth.uid())
        or exists (
          select 1 from public.courses c
          where c.id = assignments.course_id
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

create policy "Trainers manage assignments"
  on public.assignments
  for all
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        created_by = (select auth.uid())
        or trainer_id = (select auth.uid())
        or exists (
          select 1 from public.courses c
          where c.id = assignments.course_id
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

-- 8. Policies for assignment_recipients
drop policy if exists "Trainers manage assignment targeting" on public.assignment_recipients;

create policy "Trainers manage assignment targeting"
  on public.assignment_recipients
  for all
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_recipients.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or exists (
                select 1 from public.courses c
                where c.id = a.course_id
                  and c.trainer_id = (select auth.uid())
              )
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

-- 9. Policies for assignment_submissions
drop policy if exists "Trainers view assignment submissions" on public.assignment_submissions;
drop policy if exists "Trainers grade assignment submissions" on public.assignment_submissions;

create policy "Trainers view assignment submissions"
  on public.assignment_submissions
  for select
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_submissions.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
              or exists (
                select 1 from public.courses c
                where c.id = a.course_id
                  and c.trainer_id = (select auth.uid())
              )
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
    (select is_superuser())
    or (
      (select is_trainer()) and (
        exists (
          select 1 from public.assignments a
          where a.id = assignment_submissions.assignment_id
            and (
              a.created_by = (select auth.uid())
              or a.trainer_id = (select auth.uid())
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

-- 10. Student notes edit/delete policy for trainers
drop policy if exists "Trainers update and delete student notes" on public.student_notes;

create policy "Trainers update and delete student notes"
  on public.student_notes
  for all
  to authenticated
  using (
    (select is_superuser())
    or (
      (select is_trainer()) and (
        created_by = (select auth.uid())
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = student_notes.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = student_notes.student_id
            and p.trainer_id = (select auth.uid())
        )
      )
    )
  );

commit;
