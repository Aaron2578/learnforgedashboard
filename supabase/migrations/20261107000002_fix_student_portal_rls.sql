-- Migration: Fix student portal RLS policies for assignment submissions, storage, and messages
-- Ensures approved students, superusers (in preview and admin), and trainers can upload files and submit assignments.

begin;

-- 1. Policies on public.assignment_submissions
drop policy if exists "Superusers manage assignment submissions" on public.assignment_submissions;
drop policy if exists "Approved students see their submissions and superusers see all" on public.assignment_submissions;
drop policy if exists "Approved students submit assigned work before the deadline" on public.assignment_submissions;
drop policy if exists "Approved students update their own ungraded submissions" on public.assignment_submissions;
drop policy if exists "Students can submit their own work before the deadline" on public.assignment_submissions;
drop policy if exists "Students can update their own ungraded submissions" on public.assignment_submissions;
drop policy if exists "Students see their submissions and superusers see all" on public.assignment_submissions;
drop policy if exists "Students insert assignment submissions" on public.assignment_submissions;
drop policy if exists "Students update assignment submissions" on public.assignment_submissions;
drop policy if exists "Students delete assignment submissions" on public.assignment_submissions;
drop policy if exists "Students select assignment submissions" on public.assignment_submissions;
drop policy if exists "Trainers view assignment submissions" on public.assignment_submissions;
drop policy if exists "Trainers grade assignment submissions" on public.assignment_submissions;

-- Allow Superusers full management
create policy "Superusers manage assignment submissions"
  on public.assignment_submissions
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

-- Allow Trainers to view and grade assignment submissions
create policy "Trainers manage assignment submissions"
  on public.assignment_submissions
  for all
  to authenticated
  using ((select public.is_trainer()))
  with check ((select public.is_trainer()));

-- Allow Students to select their submissions
create policy "Students select assignment submissions"
  on public.assignment_submissions
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or student_id = (select auth.uid())
  );

-- Allow Students to insert their assignment submissions
create policy "Students insert assignment submissions"
  on public.assignment_submissions
  for insert
  to authenticated
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
    or student_id = (select auth.uid())
  );

-- Allow Students to update their assignment submissions
create policy "Students update assignment submissions"
  on public.assignment_submissions
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or student_id = (select auth.uid())
  )
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
    or student_id = (select auth.uid())
  );

-- Allow Students to delete their own assignment submissions or remove files
create policy "Students delete assignment submissions"
  on public.assignment_submissions
  for delete
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or student_id = (select auth.uid())
  );

-- 2. Storage policies for assignment-files bucket
drop policy if exists "Approved students can upload assignment files" on storage.objects;
drop policy if exists "Students can upload assignment files" on storage.objects;
drop policy if exists "Students and superusers can read assignment files" on storage.objects;
drop policy if exists "Approved students and superusers can read assignment files" on storage.objects;
drop policy if exists "Students and superusers can remove assignment files" on storage.objects;
drop policy if exists "Approved students and superusers can remove assignment files" on storage.objects;
drop policy if exists "Trainers can read assignment files" on storage.objects;
drop policy if exists "Allow upload to assignment-files" on storage.objects;
drop policy if exists "Allow read on assignment-files" on storage.objects;
drop policy if exists "Allow update on assignment-files" on storage.objects;
drop policy if exists "Allow delete on assignment-files" on storage.objects;

create policy "Allow upload to assignment-files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'assignment-files'
  );

create policy "Allow read on assignment-files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'assignment-files'
  );

create policy "Allow update on assignment-files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'assignment-files'
  )
  with check (
    bucket_id = 'assignment-files'
  );

create policy "Allow delete on assignment-files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'assignment-files'
  );

-- 3. Messages & Conversations
drop policy if exists "Superusers manage messages" on public.messages;
drop policy if exists "Conversation participants insert messages" on public.messages;
drop policy if exists "Conversation participants select messages" on public.messages;
drop policy if exists "Conversation participants update messages" on public.messages;

create policy "Superusers manage messages"
  on public.messages
  for all
  to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Conversation participants insert messages"
  on public.messages
  for insert
  to authenticated
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
    or sender_id = (select auth.uid())
  );

create policy "Conversation participants select messages"
  on public.messages
  for select
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or sender_id = (select auth.uid())
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = (select auth.uid())
    )
  );

create policy "Conversation participants update messages"
  on public.messages
  for update
  to authenticated
  using (
    (select public.is_superuser())
    or (select public.is_trainer())
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_superuser())
    or (select public.is_trainer())
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.student_id = (select auth.uid())
    )
  );

commit;

