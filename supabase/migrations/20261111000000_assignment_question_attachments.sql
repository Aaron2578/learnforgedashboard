-- Migration: Add question attachment columns to assignments and trainer storage permissions
begin;

-- 1. Support question PDF/DOCX/ZIP attachments and resource links on assignments
alter table public.assignments
  add column if not exists question_file_path text,
  add column if not exists question_file_name text,
  add column if not exists question_file_type text,
  add column if not exists question_url text;

-- 2. Allow Trainers to upload/manage question sheets in course-materials and assignment-files buckets
drop policy if exists "Trainers manage course materials bucket" on storage.objects;
create policy "Trainers manage course materials bucket"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'course-materials'
    and (select public.is_trainer())
  )
  with check (
    bucket_id = 'course-materials'
    and (select public.is_trainer())
  );

drop policy if exists "Trainers manage assignment files bucket" on storage.objects;
create policy "Trainers manage assignment files bucket"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'assignment-files'
    and (select public.is_trainer())
  )
  with check (
    bucket_id = 'assignment-files'
    and (select public.is_trainer())
  );

-- 3. Expand course-materials MIME allowlist cleanly (keeps existing types + zip/csv/webp)
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'course-materials';

commit;
