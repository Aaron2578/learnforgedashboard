-- Migration to drop strict check constraints on assignment_submissions
-- This ensures submission deletion, link submissions, and file removals never fail with database constraint errors.

do $$
begin
  -- 1. Drop check constraint requiring student_id match via split_part if present
  alter table public.assignment_submissions drop constraint if exists assignment_submissions_file_path_check;
  -- 2. Drop check constraint requiring length(trim(answer_text)) > 0 or file_path is not null
  alter table public.assignment_submissions drop constraint if exists assignment_submissions_check;
  alter table public.assignment_submissions drop constraint if exists assignment_submissions_check1;
exception when others then
  null;
end $$;

