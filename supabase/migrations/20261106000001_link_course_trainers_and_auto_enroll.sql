-- Migration: Link trainer_id on existing courses, grant anon select permissions,
-- and install auto-enroll trigger to ensure approved students always have course enrollments.

begin;

-- 1. Link trainer_id on courses by matching instructor name with trainer profiles
update public.courses c
set trainer_id = p.id
from public.profiles p
where p.role = 'trainer'
  and c.trainer_id is null
  and (
    lower(trim(p.full_name)) = lower(trim(c.instructor))
    or lower(trim(p.email)) = lower(trim(c.instructor))
  );

-- 2. Grant anon select permissions so guest/refreshing state never throws 42501
grant select on public.courses to anon;
grant select on public.course_enrollments to anon;

-- 3. Auto-enroll function for student profiles
create or replace function public.handle_auto_enroll_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_default_course_id uuid;
begin
  if new.role = 'student' and new.is_approved = true then
    -- Check if student already has at least one course enrollment
    if not exists (select 1 from public.course_enrollments where student_id = new.id) then
      -- Select the primary or first active course
      select id into v_default_course_id
      from public.courses
      order by created_at asc
      limit 1;

      if v_default_course_id is not null then
        insert into public.course_enrollments (course_id, student_id)
        values (v_default_course_id, new.id)
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 4. Install trigger on public.profiles
drop trigger if exists trg_auto_enroll_student on public.profiles;
create trigger trg_auto_enroll_student
  after insert or update of is_approved, role on public.profiles
  for each row
  execute function public.handle_auto_enroll_student();

-- 5. Auto-enroll any existing approved students who currently have 0 course enrollments
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
