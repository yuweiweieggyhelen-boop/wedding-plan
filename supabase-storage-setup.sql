-- Run once in Supabase SQL Editor to enable shared image storage.
-- Images are stored in a public bucket with hard-to-guess workspace paths.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wedding-media',
  'wedding-media',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wedding media public read" on storage.objects;
create policy "wedding media public read"
on storage.objects for select
using (bucket_id = 'wedding-media');

drop policy if exists "wedding media authenticated upload" on storage.objects;
create policy "wedding media authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'wedding-media');

drop policy if exists "wedding media authenticated update" on storage.objects;
create policy "wedding media authenticated update"
on storage.objects for update
to authenticated
using (bucket_id = 'wedding-media')
with check (bucket_id = 'wedding-media');

drop policy if exists "wedding media authenticated delete" on storage.objects;
create policy "wedding media authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'wedding-media');
