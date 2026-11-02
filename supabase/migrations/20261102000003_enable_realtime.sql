-- Migration: Enable Supabase Realtime for instant two-way updates between Admin & Student
begin;

-- Set replica identity full so update & delete events carry complete row data
alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.assignments replica identity full;
alter table public.assignment_submissions replica identity full;
alter table public.assignment_recipients replica identity full;
alter table public.assessments replica identity full;
alter table public.assessment_attempts replica identity full;
alter table public.assessment_recipients replica identity full;
alter table public.courses replica identity full;
alter table public.course_enrollments replica identity full;
alter table public.course_materials replica identity full;
alter table public.download_requests replica identity full;
alter table public.attendance_records replica identity full;
alter table public.student_notes replica identity full;
alter table public.profiles replica identity full;
alter table public.student_notifications replica identity full;

-- Add tables to supabase_realtime publication
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.assignment_submissions;
alter publication supabase_realtime add table public.assignment_recipients;
alter publication supabase_realtime add table public.assessments;
alter publication supabase_realtime add table public.assessment_attempts;
alter publication supabase_realtime add table public.assessment_recipients;
alter publication supabase_realtime add table public.courses;
alter publication supabase_realtime add table public.course_enrollments;
alter publication supabase_realtime add table public.course_materials;
alter publication supabase_realtime add table public.download_requests;
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.student_notes;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.student_notifications;

commit;

