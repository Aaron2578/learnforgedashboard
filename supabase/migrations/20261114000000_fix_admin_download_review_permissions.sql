-- Fix is_superuser() and download_requests permissions so admin and superuser can both review and update download requests

create or replace function public.is_superuser()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('superuser', 'admin')
  );
$$;

revoke all on function public.is_superuser() from public;
grant execute on function public.is_superuser() to authenticated;

-- Allow superuser, admin, and trainer to review download requests via security definer RPC
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
  v_is_staff boolean := false;
begin
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('superuser', 'admin', 'trainer')
  ) into v_is_staff;

  if not v_is_staff then
    raise exception 'Staff (superuser, admin, or trainer) access required.';
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

grant execute on function public.review_download_request(uuid, text, text) to authenticated;

-- Ensure RLS policies on download_requests allow admin role
drop policy if exists "Superusers manage all download requests" on public.download_requests;
drop policy if exists "Staff manage all download requests" on public.download_requests;
create policy "Staff manage all download requests"
  on public.download_requests for all to authenticated
  using (
    (select public.is_superuser())
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('superuser', 'admin', 'trainer')
    )
  )
  with check (
    (select public.is_superuser())
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('superuser', 'admin', 'trainer')
    )
  );

-- Ensure students can view their requests and staff can view all
drop policy if exists "Students view their own download requests" on public.download_requests;
create policy "Students view their own download requests"
  on public.download_requests for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.is_superuser())
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role in ('superuser', 'admin', 'trainer')
    )
  );
