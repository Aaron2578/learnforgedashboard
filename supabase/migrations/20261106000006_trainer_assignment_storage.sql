-- Migration: Allow trainers to read submitted assignment files from storage
begin;

drop policy if exists "Trainers can read assignment files" on storage.objects;

create policy "Trainers can read assignment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and (
      (select is_superuser())
      or (select is_trainer())
    )
  );

commit;

