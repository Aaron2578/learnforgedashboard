-- Function to get database size, file storage size, quota, and available space for superusers
create or replace function public.get_database_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_db_size bigint;
  v_quota bigint := 524288000; -- 500 MB (Supabase default free database storage limit)
  v_file_size bigint;
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
  
  select coalesce(sum((metadata->>'size')::bigint), 0)
  into v_file_size
  from storage.objects;

  return jsonb_build_object(
    'db_used_bytes', v_db_size,
    'db_used_pretty', pg_size_pretty(v_db_size),
    'db_quota_bytes', v_quota,
    'db_quota_pretty', pg_size_pretty(v_quota),
    'db_available_bytes', v_available,
    'db_available_pretty', pg_size_pretty(v_available),
    'db_used_percent', v_pct,
    'file_used_bytes', v_file_size,
    'file_used_pretty', pg_size_pretty(v_file_size)
  );
end;
$$;

revoke all on function public.get_database_storage_stats() from public;
grant execute on function public.get_database_storage_stats() to authenticated;
