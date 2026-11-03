-- Migration: Add Google Drive URL support to student_notes
-- Enables uploading and attaching Google Drive links (Docs, Sheets, Slides, PDFs, Folders) to notes

alter table public.student_notes
  add column if not exists drive_url text;

-- Allow body to be optional or default to empty string when note is shared primarily via Drive link
alter table public.student_notes
  alter column body drop not null;

alter table public.student_notes
  alter column body set default '';

create index if not exists student_notes_drive_url_idx
  on public.student_notes (drive_url)
  where drive_url is not null;

