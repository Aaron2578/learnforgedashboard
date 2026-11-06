-- Migration: Ensure students can view syllabus materials for enrolled courses
begin;

-- Drop previous student select policy if it exists
drop policy if exists "Students only view explicitly permitted materials" on public.course_materials;
drop policy if exists "Students can view syllabus and permitted materials" on public.course_materials;

-- Create comprehensive select policy on course_materials:
-- 1. Superusers can view all
-- 2. Trainers can view all
-- 3. Students can view if:
--    a) Explicitly permitted via material_recipients
--    b) Material is category 'Syllabus' and either campus-wide (course_id is null) or student is enrolled in the course
create policy "Students can view syllabus and permitted materials"
  on public.course_materials for select to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or (
      (select public.is_student_approved())
      and (
        exists (
          select 1 from public.material_recipients mr
          where mr.material_id = course_materials.id
            and mr.student_id = (select auth.uid())
        )
        or (
          course_materials.category = 'Syllabus'
          and (
            course_materials.course_id is null
            or public.is_student_enrolled_in_course(course_materials.course_id, (select auth.uid()))
          )
        )
      )
    )
  );

commit;

