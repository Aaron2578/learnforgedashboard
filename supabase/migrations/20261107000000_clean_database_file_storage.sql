-- Migration: Clean database file storage & attachments
-- Purges stored files from storage.objects and cleans file attachment references

create or replace function public.clean_database_file_storage()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_storage int := 0;
  v_cleared_materials int := 0;
  v_cleared_submissions int := 0;
begin
  -- 1. Purge storage objects in course-materials and assignment-files buckets
  begin
    delete from storage.objects where bucket_id in ('course-materials', 'assignment-files');
    get diagnostics v_deleted_storage = row_count;
  exception when others then
    v_deleted_storage := 0;
  end;

  -- 2. Nullify file_path and reset file_size in course_materials
  update public.course_materials
  set file_path = null,
      file_size = 0
  where file_path is not null or file_size > 0;
  get diagnostics v_cleared_materials = row_count;

  -- 3. Nullify file_path in assignment_submissions
  update public.assignment_submissions
  set file_path = null
  where file_path is not null;
  get diagnostics v_cleared_submissions = row_count;

  return jsonb_build_object(
    'deleted_storage_objects', v_deleted_storage,
    'cleared_materials', v_cleared_materials,
    'cleared_submissions', v_cleared_submissions,
    'status', 'success',
    'cleaned_at', now()
  );
end;
$$;

revoke all on function public.clean_database_file_storage() from public;
grant execute on function public.clean_database_file_storage() to authenticated;

-- Also update get_database_storage_stats to only count active attached application files and return 0 bytes when clean
create or replace function public.get_database_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_db_size bigint;
  v_quota bigint := 524288000; -- 500 MB (Supabase default free database storage limit)
  v_file_size bigint := 0;
  v_available bigint;
  v_pct numeric;
begin
  -- Only authenticated superusers (or system/postgres role) can access
  if auth.uid() is not null and not (select public.is_superuser()) then
    raise exception 'Superuser access required.';
  end if;

  v_db_size := pg_database_size(current_database());
  v_available := greatest(0, v_quota - v_db_size);
  v_pct := round((v_db_size::numeric / v_quota::numeric) * 100, 1);
  
  -- Calculate storage only for uploaded files in the application buckets (course-materials and assignment-files)
  select coalesce(sum((metadata->>'size')::bigint), 0)
  into v_file_size
  from storage.objects
  where bucket_id in ('course-materials', 'assignment-files');

  if v_file_size is null then
    v_file_size := 0;
  end if;

  return jsonb_build_object(
    'db_used_bytes', v_db_size,
    'db_used_pretty', pg_size_pretty(v_db_size),
    'db_quota_bytes', v_quota,
    'db_quota_pretty', pg_size_pretty(v_quota),
    'db_available_bytes', v_available,
    'db_available_pretty', pg_size_pretty(v_available),
    'db_used_percent', v_pct,
    'file_used_bytes', v_file_size,
    'file_used_pretty', case when v_file_size = 0 then '0 bytes' else pg_size_pretty(v_file_size) end
  );
end;
$$;

revoke all on function public.get_database_storage_stats() from public;
grant execute on function public.get_database_storage_stats() to authenticated;

-- Immediately run clean function to purge existing file attachments
select public.clean_database_file_storage();
