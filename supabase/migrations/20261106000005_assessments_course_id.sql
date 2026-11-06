-- Migration: Add course_id to assessments and link existing assessments
begin;

alter table public.assessments
  add column if not exists course_id uuid references public.courses (id) on delete set null;

-- Link SAP exam to SAP course and Gayathri Vijay
update public.assessments
set course_id = '8b0a5f6b-7cea-4bc3-aebe-731324624a7f',
    trainer_id = 'c4bd98cb-8351-4fea-8150-ff4b41918bd5'
where lower(title) like '%sap%';

commit;
