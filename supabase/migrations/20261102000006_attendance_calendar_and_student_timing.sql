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

