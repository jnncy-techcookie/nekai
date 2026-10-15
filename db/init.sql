-- NEKAI database schema (PostgreSQL 16)
-- Runs once, the first time the database container starts with an empty data volume
-- (it is copied into /docker-entrypoint-initdb.d). Safe to run again by hand:
--   psql "$DATABASE_URL" -f db/init.sql
-- Every statement skips what already exists.
--
-- Accounts live in users / sessions / password_resets. Every other table belongs to one
-- user and is removed with them (on delete cascade), so deleting a users row deletes the
-- whole account. anime_catalog is shared: anime details saved by the backend from Tenrai.

-- ---------- accounts ----------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email) and length(email) <= 254),
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists users_email_key on users (email);

-- Signed-in browsers. The cookie holds a random token; only its SHA-256 hash is stored,
-- so a copy of this table can't be used to sign in.
create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);

-- Password reset links (one hour, single use). Stored hashed, like sessions.
create table if not exists password_resets (
  token_hash text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

-- ---------- profile and settings (one row each per user, created at sign-up) ----------
create table if not exists profiles (
  user_id              uuid primary key references users (id) on delete cascade,
  display_name         text not null default '' check (length(display_name) <= 100),
  bio                  text not null default '' check (length(bio) <= 160),
  avatar_url           text,
  favorite_genres      text[] not null default '{}' check (cardinality(favorite_genres) <= 3),
  onboarding_completed boolean not null default false,
  first_home_seen      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists user_settings (
  user_id          uuid primary key references users (id) on delete cascade,
  sound            boolean not null default false,
  confetti         boolean not null default true,
  neko             boolean not null default true,  -- the Neko chat on/off switch
  streak           boolean not null default true,  -- streak reminders
  motion           boolean not null default false, -- reduce motion
  text             boolean not null default false, -- larger text
  contrast         boolean not null default false, -- stronger outlines
  dark             boolean not null default false,
  nav_open         boolean not null default true,
  neko_hidden      boolean not null default false, -- Neko's button tucked away
  library_view     text not null default 'list' check (library_view in ('list', 'cards')),
  streak_nudged_on date,                           -- the last day the streak reminder showed
  timezone         text not null default 'Asia/Manila' check (length(timezone) <= 64),
  updated_at       timestamptz not null default now()
);

-- ---------- anime details (shared by everyone) ----------
-- metadata is the frontend's normalized anime object (see backend/src/services/catalog.js)
create table if not exists anime_catalog (
  anime_id   integer primary key check (anime_id > 0), -- MyAnimeList id
  metadata   jsonb not null default '{}',
  fetched_at timestamptz not null default now()
);

-- ---------- the user's list ----------
-- Removing a title sets deleted_at instead of deleting the row
create table if not exists user_anime (
  user_id        uuid not null references users (id) on delete cascade,
  anime_id       integer not null check (anime_id > 0),
  status         text not null check (status in ('watching', 'plan', 'completed', 'dropped')),
  watched        integer not null default 0 check (watched between 0 and 100000),
  rating         numeric(3, 1) not null default 0 check (rating between 0 and 10),
  note           text not null default '' check (length(note) <= 2000),
  completed_once boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  primary key (user_id, anime_id)
);

-- Watch history: one row per change in episodes watched (the app adds them up per day)
create table if not exists watch_events (
  event_id      bigint generated always as identity primary key,
  user_id       uuid not null references users (id) on delete cascade,
  anime_id      integer not null check (anime_id > 0),
  event_type    text not null check (event_type in ('watch', 'correction')),
  episode_delta integer not null check (episode_delta <> 0 and episode_delta between -100000 and 100000),
  activity_date date not null,   -- the day in the user's own time zone
  timezone      text not null check (length(timezone) <= 64),
  occurred_at   timestamptz not null default now()
);
create index if not exists watch_events_user_idx on watch_events (user_id, activity_date);

create table if not exists user_achievements (
  user_id        uuid not null references users (id) on delete cascade,
  achievement_id text not null check (achievement_id in (
    'first_steps', 'finisher', 'critic', 'binge_mode', 'explorer', 'week_streak', 'finisher_ii', 'long_haul'
  )),
  earned_at      timestamptz, -- null: earned before unlock times were recorded
  primary key (user_id, achievement_id)
);

-- "Not interested" titles; un-hiding sets deleted_at
create table if not exists hidden_recommendations (
  user_id    uuid not null references users (id) on delete cascade,
  anime_id   integer not null check (anime_id > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, anime_id)
);

-- The latest AI picks (Nekai's Picks), one row per user
create table if not exists user_recommendations (
  user_id      uuid primary key references users (id) on delete cascade,
  input_key    text not null default '' check (length(input_key) <= 2000),
  generated_at timestamptz not null default now(),
  items        jsonb not null default '[]' check (jsonb_typeof(items) = 'array')
);

-- ---------- Neko chats ----------
-- Clearing a chat sets deleted_at, so it stays in history
create table if not exists neko_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  title           text not null default 'Neko chat' check (length(title) <= 120),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists neko_conversations_user_idx on neko_conversations (user_id, updated_at desc);

create table if not exists neko_messages (
  user_id         uuid not null references users (id) on delete cascade,
  message_id      uuid not null, -- made by the browser, so a retried save never doubles a message
  conversation_id uuid not null references neko_conversations (conversation_id) on delete cascade,
  role            text not null check (role in ('user', 'neko')),
  content         text not null check (length(content) <= 20000),
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  primary key (user_id, message_id)
);
create index if not exists neko_messages_conversation_idx on neko_messages (conversation_id, created_at);
