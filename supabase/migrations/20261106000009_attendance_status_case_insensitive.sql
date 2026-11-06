-- Migration: Allow case-insensitive attendance status, safe note defaults,
-- and strictly scope trainer attendance management to their assigned students.

begin;

-- 1. Update check constraint on attendance_records to accept both lowercase and title-case status
alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check check (lower(status) in ('present', 'late', 'absent'));

-- 2. Ensure note is optional and defaults to empty string
alter table public.attendance_records alter column note drop not null;
alter table public.attendance_records alter column note set default '';

-- 3. Scope trainer attendance permissions strictly to their assigned students and courses
drop policy if exists "Trainers manage attendance records" on public.attendance_records;

create policy "Trainers manage attendance records"
  on public.attendance_records
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        created_by = (select auth.uid())
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = attendance_records.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = attendance_records.student_id
            and p.trainer_id = (select auth.uid())
        )
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
        or exists (
          select 1 from public.course_enrollments ce
          where ce.student_id = attendance_records.student_id
            and public.is_trainer_for_course(ce.course_id, (select auth.uid()))
        )
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        created_by = (select auth.uid())
        or exists (
          select 1 from public.trainer_students ts
          where ts.student_id = attendance_records.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = attendance_records.student_id
            and p.trainer_id = (select auth.uid())
        )
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
        or exists (
          select 1 from public.course_enrollments ce
          where ce.student_id = attendance_records.student_id
            and public.is_trainer_for_course(ce.course_id, (select auth.uid()))
        )
      )
    )
  );

-- 4. Ensure proper table grants
grant select, insert, update, delete on public.attendance_records to authenticated;

commit;

