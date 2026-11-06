-- Migration: Complete fix for assignments RLS recursion, messaging permissions,
-- student notes / task assignment, and student portal coursework accessibility.

begin;

-- 1. Helper function: check student assignment targeting without triggering RLS
create or replace function public.is_student_assigned_to_assignment(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.assignment_recipients
    where assignment_id = p_assignment_id
      and student_id = p_student_id
  );
$$;

revoke all on function public.is_student_assigned_to_assignment(uuid, uuid) from public;
grant execute on function public.is_student_assigned_to_assignment(uuid, uuid) to anon, authenticated, service_role;

-- 2. Helper function: check trainer ownership of an assignment without triggering RLS
create or replace function public.is_trainer_for_assignment(p_assignment_id uuid, p_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and (
        a.created_by = p_trainer_id
        or a.trainer_id = p_trainer_id
        or (a.course_id is not null and public.is_trainer_for_course(a.course_id, p_trainer_id))
      )
  );
$$;

revoke all on function public.is_trainer_for_assignment(uuid, uuid) from public;
grant execute on function public.is_trainer_for_assignment(uuid, uuid) to anon, authenticated, service_role;

-- 3. Helper function: check student test targeting without triggering RLS
create or replace function public.is_student_targeted_for_test(p_assessment_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.assessment_recipients
    where assessment_id = p_assessment_id
      and student_id = p_student_id
  );
$$;

revoke all on function public.is_student_targeted_for_test(uuid, uuid) from public;
grant execute on function public.is_student_targeted_for_test(uuid, uuid) to anon, authenticated, service_role;

-- 4. Clean up and recreate policies on public.assignments
drop policy if exists "Students can view assigned published assignments" on public.assignments;
drop policy if exists "Trainers view assignments" on public.assignments;
drop policy if exists "Trainers manage assignments" on public.assignments;
drop policy if exists "Superusers can create assignments" on public.assignments;
drop policy if exists "Superusers can update assignments" on public.assignments;
drop policy if exists "Superusers can delete assignments" on public.assignments;
drop policy if exists "Superusers manage assignments" on public.assignments;

create policy "Superusers manage assignments"
  on public.assignments
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students can view assigned published assignments"
  on public.assignments
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      published = true
      and (select public.is_student_approved())
      and public.is_student_assigned_to_assignment(id, (select auth.uid()))
    )
  );

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

-- 5. Clean up and recreate policies on public.assignment_recipients
drop policy if exists "Students see their assignment targeting" on public.assignment_recipients;
drop policy if exists "Trainers manage assignment targeting" on public.assignment_recipients;
drop policy if exists "Superusers manage assignment targeting" on public.assignment_recipients;

create policy "Superusers manage assignment targeting"
  on public.assignment_recipients
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students see their assignment targeting"
  on public.assignment_recipients
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Trainers manage assignment targeting"
  on public.assignment_recipients
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        public.is_trainer_for_assignment(assignment_id, (select auth.uid()))
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
        public.is_trainer_for_assignment(assignment_id, (select auth.uid()))
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

-- 6. Clean up and recreate policies on public.assignment_submissions
drop policy if exists "Approved students see their submissions and superusers see all" on public.assignment_submissions;
drop policy if exists "Approved students submit assigned work before the deadline" on public.assignment_submissions;
drop policy if exists "Approved students update their own ungraded submissions" on public.assignment_submissions;
drop policy if exists "Superusers can grade submissions" on public.assignment_submissions;
drop policy if exists "Trainers view assignment submissions" on public.assignment_submissions;
drop policy if exists "Trainers grade assignment submissions" on public.assignment_submissions;
drop policy if exists "Superusers manage assignment submissions" on public.assignment_submissions;

create policy "Superusers manage assignment submissions"
  on public.assignment_submissions
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Approved students see their submissions and superusers see all"
  on public.assignment_submissions
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Approved students submit assigned work before the deadline"
  on public.assignment_submissions
  for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and public.is_student_assigned_to_assignment(assignment_id, (select auth.uid()))
  );

create policy "Approved students update their own ungraded submissions"
  on public.assignment_submissions
  for update
  to authenticated
  using (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and graded_at is null
  )
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and graded_at is null
  );

create policy "Trainers view assignment submissions"
  on public.assignment_submissions
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
        public.is_trainer_for_assignment(assignment_id, (select auth.uid()))
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
        public.is_trainer_for_assignment(assignment_id, (select auth.uid()))
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
        public.is_trainer_for_assignment(assignment_id, (select auth.uid()))
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

-- 7. Update assessments policies using helper to prevent test recursion
drop policy if exists "Students can view assigned published tests" on public.assessments;

create policy "Students can view assigned published tests"
  on public.assessments
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      published = true
      and (select public.is_student_approved())
      and public.is_student_targeted_for_test(id, (select auth.uid()))
    )
  );

-- 8. Enhance student_notes schema and fix permissions / RLS
alter table public.student_notes
  add column if not exists material_id uuid references public.course_materials (id) on delete set null;

drop policy if exists "Students see notes assigned to them" on public.student_notes;
drop policy if exists "Superusers manage student notes" on public.student_notes;
drop policy if exists "Trainers manage student tasks" on public.student_notes;
drop policy if exists "Trainers update and delete student notes" on public.student_notes;
drop policy if exists "Students update their assigned note status" on public.student_notes;
drop policy if exists "Trainers manage student notes" on public.student_notes;

create policy "Superusers manage student notes"
  on public.student_notes
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students see notes assigned to them"
  on public.student_notes
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Students update their assigned note status"
  on public.student_notes
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  )
  with check (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Trainers manage student notes"
  on public.student_notes
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_trainer()) and (
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
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
        or exists (
          select 1 from public.course_enrollments ce
          where ce.student_id = student_notes.student_id
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
          where ts.student_id = student_notes.student_id
            and ts.trainer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles p
          where p.id = student_notes.student_id
            and p.trainer_id = (select auth.uid())
        )
        or (course_id is not null and public.is_trainer_for_course(course_id, (select auth.uid())))
        or exists (
          select 1 from public.course_enrollments ce
          where ce.student_id = student_notes.student_id
            and public.is_trainer_for_course(ce.course_id, (select auth.uid()))
        )
      )
    )
  );

-- 9. Fix conversations and messages policies and permissions
drop policy if exists "Approved students and superusers can view conversations" on public.conversations;
drop policy if exists "Approved students can start their own conversations" on public.conversations;
drop policy if exists "Trainers manage conversations" on public.conversations;
drop policy if exists "Superusers manage conversations" on public.conversations;
drop policy if exists "Students view conversations" on public.conversations;
drop policy if exists "Students insert conversations" on public.conversations;

create policy "Superusers manage conversations"
  on public.conversations
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students view conversations"
  on public.conversations
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Students insert conversations"
  on public.conversations
  for insert
  to authenticated
  with check (
    (select public.is_superuser())
    or (
      student_id = (select auth.uid())
      and (select public.is_student_approved())
    )
  );

create policy "Trainers manage conversations"
  on public.conversations
  for all
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
  )
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
  );

drop policy if exists "Approved conversation participants can read messages" on public.messages;
drop policy if exists "Approved conversation participants can send messages" on public.messages;
drop policy if exists "Approved recipients can mark messages as read" on public.messages;
drop policy if exists "Trainers manage messages" on public.messages;
drop policy if exists "Superusers manage messages" on public.messages;
drop policy if exists "Conversation participants select messages" on public.messages;
drop policy if exists "Conversation participants insert messages" on public.messages;
drop policy if exists "Conversation participants update messages" on public.messages;

create policy "Superusers manage messages"
  on public.messages
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Conversation participants select messages"
  on public.messages
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id
          and c.student_id = (select auth.uid())
      )
    )
  );

create policy "Conversation participants insert messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (select public.is_superuser())
      or (select public.is_trainer())
      or (
        (select public.is_student_approved())
        and exists (
          select 1 from public.conversations c
          where c.id = messages.conversation_id
            and c.student_id = (select auth.uid())
        )
      )
    )
  );

create policy "Conversation participants update messages"
  on public.messages
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id
          and c.student_id = (select auth.uid())
      )
    )
  )
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
    or (
      (select public.is_student_approved())
      and exists (
        select 1 from public.conversations c
        where c.id = messages.conversation_id
          and c.student_id = (select auth.uid())
      )
    )
  );

-- 10. Table permissions
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.assignment_recipients to authenticated;
grant select, insert, update, delete on public.assignment_submissions to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, update on public.student_notifications to authenticated;

commit;

