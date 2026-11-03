-- Migration: Strictly per-student note and material permissions
-- Ensures that even if students have the same course_id, materials/notes are NOT shared across the course.
-- A student can ONLY view materials explicitly permitted to them in material_recipients.

-- Drop any previous course-wide or campus-wide access policies for course_materials
drop policy if exists "Approved students can view course materials" on public.course_materials;
drop policy if exists "Students can view materials for enrolled courses" on public.course_materials;
drop policy if exists "Students only view explicitly permitted materials" on public.course_materials;

-- Policy: Superusers can manage all course materials
-- (Keep existing or recreate safely)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'course_materials' and policyname = 'Superusers manage all course materials'
  ) then
    create policy "Superusers manage all course materials"
      on public.course_materials for all to authenticated
      using ((select public.is_superuser()))
      with check ((select public.is_superuser()));
  end if;
end $$;

-- Policy: Approved students can ONLY view materials that have been explicitly granted to them individually in material_recipients.
-- Even if multiple students are enrolled in the same course, each student must be granted access individually.
create policy "Students only view explicitly permitted materials"
  on public.course_materials for select to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.material_recipients mr
        where mr.material_id = course_materials.id
          and mr.student_id = (select auth.uid())
      )
    )
  );

-- Ensure material_recipients table has proper indexes and realtime enabled
create index if not exists material_recipients_student_material_idx on public.material_recipients (student_id, material_id);

