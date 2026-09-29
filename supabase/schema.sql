-- FRC Hub — database schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- Written for a project with "Automatically expose new tables" turned OFF
-- (Settings -> API -> the Data API security toggles) -- so the table gets
-- an explicit grant below instead of relying on that default. RLS still
-- does the actual per-row access control; the grant just lets the
-- authenticated role reach the table at all.

grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- One row per signed-in user, holding their entire Season Tracker state
-- (milestone/task progress, custom events, subteam roster, mechanisms,
-- team members, task assignments) as a single JSON blob -- see
-- js/season.js's currentStateSnapshot()/applyCloudSnapshot() for the
-- exact shape. A single JSONB column is deliberate here: this data is
-- always read/written as one unit per user, never queried by field, so a
-- fully normalized schema would just add migration overhead with no
-- benefit.
create table if not exists public.season_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.season_data enable row level security;

create policy "Users can view their own season data"
  on public.season_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own season data"
  on public.season_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own season data"
  on public.season_data for update
  using (auth.uid() = user_id);

grant select, insert, update on public.season_data to authenticated;

-- ---- Forum ----
--
-- One row per signed-in user, giving their posts a real team identity
-- instead of an anonymous username. Publicly readable (a post's author
-- badge needs to render for anonymous visitors too) but only editable by
-- its own owner.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  team_number text not null,
  team_name text,
  district text,
  display_name text,
  avatar_color text,
  signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the initial release for personal profile customization
-- (header display name, avatar color, forum signature). Kept as
-- explicit alters so re-running this file against an already-
-- provisioned database picks up the new columns without dropping data.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_color text;
alter table public.profiles add column if not exists signature text;

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;

-- Threads. `board` is a slug from js/forum-data.js's BOARDS registry --
-- either a district (e.g. "district-chesapeake") or a team-to-team
-- matchmaking category (e.g. "team2team-parts"). Anyone can read; only
-- signed-in users with a profile can start one, and only the author can
-- edit/delete their own.
--
-- author_id references profiles, not auth.users directly, on purpose:
-- profiles.id IS a user's auth id (1:1), so this still identifies the
-- user, but it (a) requires a team profile to exist before a post can,
-- enforcing "set your team number first" at the database level, and
-- (b) lets PostgREST embed the author's team info directly in one query
-- (select "*, profiles(...)"), which a reference to auth.users can't do
-- since that schema isn't exposed to the API.
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  title text not null,
  body text not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forum_posts enable row level security;

create policy "Forum posts are publicly readable"
  on public.forum_posts for select
  using (true);

create policy "Users can create their own forum posts"
  on public.forum_posts for insert
  with check (auth.uid() = author_id);

create policy "Users can update their own forum posts"
  on public.forum_posts for update
  using (auth.uid() = author_id);

create policy "Users can delete their own forum posts"
  on public.forum_posts for delete
  using (auth.uid() = author_id);

grant select on public.forum_posts to anon;
grant select, insert, update, delete on public.forum_posts to authenticated;

create index if not exists forum_posts_board_created_idx on public.forum_posts (board, created_at desc);

-- Replies, same access pattern as posts (see forum_posts.author_id above
-- for why this references profiles rather than auth.users).
create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.forum_replies enable row level security;

create policy "Forum replies are publicly readable"
  on public.forum_replies for select
  using (true);

create policy "Users can create their own forum replies"
  on public.forum_replies for insert
  with check (auth.uid() = author_id);

create policy "Users can delete their own forum replies"
  on public.forum_replies for delete
  using (auth.uid() = author_id);

grant select on public.forum_replies to anon;
grant select, insert, delete on public.forum_replies to authenticated;

create index if not exists forum_replies_post_idx on public.forum_replies (post_id, created_at asc);
