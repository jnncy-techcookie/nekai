-- NEKAI: remove the obsolete username/handle field from user profiles.
-- Run once in Supabase Dashboard -> SQL Editor after deploying the matching app changes.
--
-- The app no longer reads, displays, generates, or updates profiles.handle.
-- Existing display names, bios, avatars, favorite genres, and account data are untouched.

alter table public.profiles
  drop column if exists handle;
