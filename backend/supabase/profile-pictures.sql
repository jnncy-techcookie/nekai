-- NEKAI: profile pictures
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this → Run.
-- Safe to run again: every step skips what already exists.
--
-- What it sets up:
--   1. profiles.avatar_url  – the public URL of the user's picture (empty = the drawn face)
--   2. a public "avatars" storage bucket, 1 MB per file, images only
--      (the app uploads a 256×256 WebP or JPEG, usually 10–30 KB)
--   3. storage rules: anyone can view pictures; a signed-in user can only add,
--      replace or delete files in their own folder (avatars/<their user id>/...)

-- 1. The column
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. The bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- 3. The storage rules (dropped first so this script can be re-run)
drop policy if exists "Avatar images are public" on storage.objects;
create policy "Avatar images are public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users add their own avatar" on storage.objects;
create policy "Users add their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users replace their own avatar" on storage.objects;
create policy "Users replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Note: users can already update their own profiles row (the app saves display_name and bio
-- the same way), so avatar_url needs no extra rule.
