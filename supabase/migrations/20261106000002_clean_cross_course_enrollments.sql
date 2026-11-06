-- Migration: Remove accidental cross-course enrollment for Amritha in Full Stack Python,
-- ensuring each student belongs strictly to their intended course track and trainer cohort.

begin;

-- Remove accidental cross-course enrollment for Amritha (SAP student) in Full Stack Python (IT course)
delete from public.course_enrollments
where student_id = '051e6aae-111b-4e30-a76e-30e060bfc865'
  and course_id = 'f6ea8aac-ac4c-43bc-a886-cf1564ed2822';

commit;
