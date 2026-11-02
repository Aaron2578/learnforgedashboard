-- Automatically assign newly approved students to existing published assignments and assessments
create or replace function public.auto_assign_approved_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'student' and new.is_approved = true and (old.is_approved is null or old.is_approved = false) then
    insert into public.assignment_recipients (assignment_id, student_id)
    select a.id, new.id
    from public.assignments a
    where a.published
    on conflict do nothing;

    insert into public.assessment_recipients (assessment_id, student_id)
    select a.id, new.id
    from public.assessments a
    where a.published
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_student_approval_assign_coursework on public.profiles;
create trigger on_student_approval_assign_coursework
  after update on public.profiles
  for each row
  execute function public.auto_assign_approved_student();
