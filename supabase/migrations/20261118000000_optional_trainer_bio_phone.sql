-- Optional helper migration to add phone and bio to public.profiles if desired
alter table public.profiles
  add column if not exists phone text,
  add column if not exists bio text;
