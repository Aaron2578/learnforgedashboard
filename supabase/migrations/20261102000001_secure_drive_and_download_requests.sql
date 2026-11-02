-- Migration: Secure Drive Materials, Test Links & Student Download Approval Workflow
-- 1. Add file attachments support to assessments
alter table public.assessments
  add column if not exists file_path text,
  add column if not exists file_name text;

-- 2. Create course_materials table for Drive links and uploaded files
create table if not exists public.course_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  category text not null default 'Document' check (category in ('Document', 'PDF', 'Test / Assessment', 'Lecture Notes', 'Study Guide', 'Other')),
  course_id uuid references public.courses (id) on delete set null,
  file_path text,
  file_name text,
  file_size bigint default 0,
  file_type text default 'application/pdf',
  drive_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (file_path is not null or drive_url is not null)
);

create index if not exists course_materials_course_idx on public.course_materials (course_id);
create index if not exists course_materials_created_idx on public.course_materials (created_at desc);

-- 3. Create download_requests table for individual student download permission & revocation
create table if not exists public.download_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid references public.course_materials (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  reason text default '',
  admin_notes text default '',
  reviewed_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (material_id is not null or assessment_id is not null)
);

create unique index if not exists download_requests_student_material_idx
  on public.download_requests (student_id, material_id)
  where material_id is not null;

create unique index if not exists download_requests_student_assessment_idx
  on public.download_requests (student_id, assessment_id)
  where assessment_id is not null;

create index if not exists download_requests_student_idx on public.download_requests (student_id);
create index if not exists download_requests_status_idx on public.download_requests (status);

-- 4. Enable RLS
alter table public.course_materials enable row level security;
alter table public.download_requests enable row level security;

-- Policies for course_materials
create policy "Superusers manage all course materials"
  on public.course_materials for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Approved students can view course materials"
  on public.course_materials for select to authenticated
  using (
    (select public.is_superuser())
    or (
      (select public.is_student_approved())
      and (
        course_id is null
        or exists (
          select 1 from public.course_enrollments e
          where e.course_id = course_materials.course_id
            and e.student_id = (select auth.uid())
        )
      )
    )
  );

-- Policies for download_requests
create policy "Superusers manage all download requests"
  on public.download_requests for all to authenticated
  using ((select public.is_superuser()))
  with check ((select public.is_superuser()));

create policy "Students view their own download requests"
  on public.download_requests for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_superuser()));

create policy "Approved students can submit download requests"
  on public.download_requests for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_student_approved())
    and status = 'pending'
  );

-- 5. RPC Functions for safe download request workflow
create or replace function public.request_download(
  p_material_id uuid default null,
  p_assessment_id uuid default null,
  p_reason text default ''
)
returns public.download_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid := auth.uid();
  v_rec public.download_requests;
begin
  if v_student_id is null then
    raise exception 'You must be signed in to request a download.';
  end if;
  if not (select public.is_student_approved()) and not (select public.is_superuser()) then
    raise exception 'Your account is pending administrator approval.';
  end if;
  if p_material_id is null and p_assessment_id is null then
    raise exception 'Specify a material or assessment to request.';
  end if;

  if p_material_id is not null then
    insert into public.download_requests (student_id, material_id, reason, status, requested_at)
    values (v_student_id, p_material_id, coalesce(p_reason, ''), 'pending', now())
    on conflict (student_id, material_id) where material_id is not null
    do update set
      status = 'pending',
      reason = coalesce(nullif(excluded.reason, ''), public.download_requests.reason),
      requested_at = now()
    returning * into v_rec;
  else
    insert into public.download_requests (student_id, assessment_id, reason, status, requested_at)
    values (v_student_id, p_assessment_id, coalesce(p_reason, ''), 'pending', now())
    on conflict (student_id, assessment_id) where assessment_id is not null
    do update set
      status = 'pending',
      reason = coalesce(nullif(excluded.reason, ''), public.download_requests.reason),
      requested_at = now()
    returning * into v_rec;
  end if;

  return v_rec;
end;
$$;

create or replace function public.review_download_request(
  p_request_id uuid,
  p_status text,
  p_notes text default ''
)
returns public.download_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec public.download_requests;
begin
  if not (select public.is_superuser()) then
    raise exception 'Superuser access required.';
  end if;

  if p_status not in ('approved', 'rejected', 'revoked', 'pending') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.download_requests
  set status = p_status,
      admin_notes = coalesce(p_notes, admin_notes),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_request_id
  returning * into v_rec;

  if not found then
    raise exception 'Download request not found.';
  end if;

  return v_rec;
end;
$$;

revoke all on function public.request_download(uuid, uuid, text) from public;
grant execute on function public.request_download(uuid, uuid, text) to authenticated;

revoke all on function public.review_download_request(uuid, text, text) from public;
grant execute on function public.review_download_request(uuid, text, text) to authenticated;

-- Grants
grant select on public.course_materials to authenticated;
grant insert, update, delete on public.course_materials to authenticated;

grant select on public.download_requests to authenticated;
grant insert, update, delete on public.download_requests to authenticated;

-- 6. Storage bucket for course materials
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage object policies
drop policy if exists "Superusers manage course materials bucket" on storage.objects;
create policy "Superusers manage course materials bucket"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'course-materials'
    and (select public.is_superuser())
  )
  with check (
    bucket_id = 'course-materials'
    and (select public.is_superuser())
  );

drop policy if exists "Approved students can view course materials" on storage.objects;
create policy "Approved students can view course materials"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      (select public.is_student_approved())
      or (select public.is_superuser())
    )
  );

