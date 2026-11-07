-- Migration: Add 'holiday' status to attendance_records
-- Allows attendance status check constraint to include 'holiday' in addition to present, late, absent.

begin;

alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check check (lower(status) in ('present', 'late', 'absent', 'holiday'));

commit;

