-- FRC Hub — database schema
-- Run in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run in full after a migration (e.g. new columns below) --
-- every `create policy` is preceded by a matching `drop policy if
-- exists` so re-running never fails on "policy already exists".
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

drop policy if exists "Users can view their own season data" on public.season_data;
create policy "Users can view their own season data"
  on public.season_data for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own season data" on public.season_data;
create policy "Users can insert their own season data"
  on public.season_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own season data" on public.season_data;
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

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
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

drop policy if exists "Forum posts are publicly readable" on public.forum_posts;
create policy "Forum posts are publicly readable"
  on public.forum_posts for select
  using (true);

drop policy if exists "Users can create their own forum posts" on public.forum_posts;
create policy "Users can create their own forum posts"
  on public.forum_posts for insert
  with check (auth.uid() = author_id);

drop policy if exists "Users can update their own forum posts" on public.forum_posts;
create policy "Users can update their own forum posts"
  on public.forum_posts for update
  using (auth.uid() = author_id);

drop policy if exists "Users can delete their own forum posts" on public.forum_posts;
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

drop policy if exists "Forum replies are publicly readable" on public.forum_replies;
create policy "Forum replies are publicly readable"
  on public.forum_replies for select
  using (true);

drop policy if exists "Users can create their own forum replies" on public.forum_replies;
create policy "Users can create their own forum replies"
  on public.forum_replies for insert
  with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own forum replies" on public.forum_replies;
create policy "Users can delete their own forum replies"
  on public.forum_replies for delete
  using (auth.uid() = author_id);

grant select on public.forum_replies to anon;
grant select, insert, delete on public.forum_replies to authenticated;

create index if not exists forum_replies_post_idx on public.forum_replies (post_id, created_at asc);

-- ---- Teams ----
--
-- A team is the real multi-user entity mentor/student accounts attach to
-- (see js/team.js). `team_data` below replaces `season_data` as the thing
-- Season Tracker syncs to once a user is on a team -- season_data above is
-- left fully intact as the fallback for solo/no-team use, exactly as it
-- works today.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_number text not null,
  team_name text,
  district text,
  join_code_student text not null unique,
  join_code_mentor text not null unique,
  -- Bumped by start_new_season() below -- just a counter used to decide
  -- "has this team's season already been reset this cycle", not tied to
  -- any particular calendar math.
  current_season_year int not null default extract(year from now())::int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per *user*, not per (team, user) -- a person is on exactly one
-- team at a time, enforced here by user_id being the primary key instead
-- of needing a separate uniqueness check everywhere.
create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role text not null check (role in ('mentor', 'student')),
  -- Which subteam a student is on -- used for the roster chip color and
  -- for technical_captain/nontechnical_captain scoping. Meaningless for
  -- mentors.
  subteam text not null default 'cross-team'
    check (subteam in ('design', 'mechanical', 'electrical', 'programming', 'business', 'cross-team')),
  -- Subset of: team_captain, technical_captain, nontechnical_captain,
  -- design_captain, mechanical_captain, electrical_captain,
  -- programming_captain, business_captain -- see js/team.js's
  -- CAPTAIN_SCOPES for what each one can assign. Meaningful for students
  -- only; mentors already have full access regardless of this.
  captain_roles text[] not null default '{}'
    check (captain_roles <@ array['team_captain','technical_captain','nontechnical_captain','design_captain','mechanical_captain','electrical_captain','programming_captain','business_captain']::text[]),
  joined_at timestamptz not null default now()
);

create index if not exists team_members_team_idx on public.team_members (team_id);

-- The shared Season Tracker blob for a team -- same shape/purpose as
-- season_data above (see its comment: one JSONB column because it's
-- always read/written as a whole, never queried by field), just keyed by
-- team instead of user, since every member of a team now reads and writes
-- one shared state instead of each having their own. Completed grants
-- (`completedGrants` inside the blob, written by js/season.js) live here
-- too rather than in a separate table, for the same reason.
create table if not exists public.team_data (
  team_id uuid primary key references public.teams (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per "start new season" (see start_new_season() below) -- a
-- snapshot of team_data right before it gets cleared, so a mentor
-- resetting completed grants/progress for the new season doesn't actually
-- destroy last season's record.
create table if not exists public.season_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  season_label text not null,
  data jsonb not null,
  archived_at timestamptz not null default now()
);

create index if not exists season_history_team_idx on public.season_history (team_id, archived_at desc);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_data enable row level security;
alter table public.season_history enable row level security;

-- ---- Helper functions ----
--
-- security definer + a fixed search_path so these can read team_members
-- from inside a policy on team_members/teams itself without the policy
-- recursing into itself -- the standard Supabase pattern for this.
create or replace function public.my_team_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

create or replace function public.is_mentor_of(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and team_id = t and role = 'mentor'
  );
$$;

create or replace function public.is_team_captain_of(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where user_id = auth.uid() and team_id = t and 'team_captain' = any(captain_roles)
  );
$$;

grant execute on function public.my_team_id() to authenticated;
grant execute on function public.is_mentor_of(uuid) to authenticated;
grant execute on function public.is_team_captain_of(uuid) to authenticated;

-- ---- RLS ----
--
-- teams/team_members get NO insert/update/delete grant to authenticated
-- at all -- every write goes through a security-definer RPC below, which
-- re-checks the caller's role itself. That's what stops a plain student
-- from e.g. editing their own row to grant themselves the mentor role,
-- and means join codes never need a "select every team" policy (joining
-- goes through join_team() below, not a direct select+insert).
drop policy if exists "Members can view their own team" on public.teams;
create policy "Members can view their own team"
  on public.teams for select
  using (id = public.my_team_id());

drop policy if exists "Members can view their team roster" on public.team_members;
create policy "Members can view their team roster"
  on public.team_members for select
  using (team_id = public.my_team_id());

drop policy if exists "Team members can view their shared season data" on public.team_data;
create policy "Team members can view their shared season data"
  on public.team_data for select
  using (team_id = public.my_team_id());

drop policy if exists "Team members can insert their shared season data" on public.team_data;
create policy "Team members can insert their shared season data"
  on public.team_data for insert
  with check (team_id = public.my_team_id());

drop policy if exists "Team members can update their shared season data" on public.team_data;
create policy "Team members can update their shared season data"
  on public.team_data for update
  using (team_id = public.my_team_id());

drop policy if exists "Members can view their season history" on public.season_history;
create policy "Members can view their season history"
  on public.season_history for select
  using (team_id = public.my_team_id());

grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select on public.season_history to authenticated;
grant select, insert, update on public.team_data to authenticated;

-- ---- RPCs ----
--
-- State-changing, multi-step, or sensitive operations all go through
-- these instead of a direct table write -- see the no-insert/update-grant
-- note above. Each one re-derives the caller from auth.uid() and checks
-- their membership/role itself, so it's safe to expose to any
-- authenticated user.
create or replace function public.generate_join_code()
returns text
language sql stable as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 6));
$$;

create or replace function public.create_team(p_team_number text, p_team_name text, p_district text)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.teams;
  v_student_code text;
  v_mentor_code text;
begin
  if exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'You are already on a team.';
  end if;

  loop
    v_student_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code_student = v_student_code or join_code_mentor = v_student_code);
  end loop;
  loop
    v_mentor_code := public.generate_join_code();
    exit when v_mentor_code <> v_student_code
      and not exists (select 1 from public.teams where join_code_student = v_mentor_code or join_code_mentor = v_mentor_code);
  end loop;

  insert into public.teams (team_number, team_name, district, join_code_student, join_code_mentor)
  values (trim(p_team_number), nullif(trim(p_team_name), ''), nullif(p_district, ''), v_student_code, v_mentor_code)
  returning * into v_team;

  insert into public.team_members (user_id, team_id, role) values (auth.uid(), v_team.id, 'mentor');
  insert into public.team_data (team_id, data) values (v_team.id, '{}'::jsonb);

  return v_team;
end;
$$;

create or replace function public.join_team(p_code text)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  v_team public.teams;
  v_role text;
begin
  if exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'You are already on a team.';
  end if;

  select * into v_team from public.teams where join_code_student = upper(trim(p_code));
  if found then
    v_role := 'student';
  else
    select * into v_team from public.teams where join_code_mentor = upper(trim(p_code));
    if found then v_role := 'mentor'; end if;
  end if;

  if v_team.id is null then
    raise exception 'That join code was not found. Double-check it with your mentor.';
  end if;

  insert into public.team_members (user_id, team_id, role) values (auth.uid(), v_team.id, v_role);

  return v_team;
end;
$$;

create or replace function public.leave_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_role text;
  v_other_mentors int;
begin
  select team_id, role into v_team_id, v_role from public.team_members where user_id = auth.uid();
  if v_team_id is null then
    raise exception 'You are not on a team.';
  end if;

  if v_role = 'mentor' then
    select count(*) into v_other_mentors from public.team_members
      where team_id = v_team_id and role = 'mentor' and user_id <> auth.uid();
    if v_other_mentors = 0 then
      raise exception 'You are the only mentor on this team -- promote a co-mentor first, or delete the team instead.';
    end if;
  end if;

  delete from public.team_members where user_id = auth.uid();
end;
$$;

create or replace function public.delete_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.team_members where user_id = auth.uid() and role = 'mentor';
  if v_team_id is null then
    raise exception 'Only a mentor can delete the team.';
  end if;
  delete from public.teams where id = v_team_id; -- cascades team_members/team_data/season_history
end;
$$;

create or replace function public.regenerate_join_code(p_team_id uuid, p_which text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_mentor_of(p_team_id) then
    raise exception 'Only a mentor can regenerate a join code.';
  end if;
  if p_which not in ('student', 'mentor') then
    raise exception 'Unknown join code type.';
  end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code_student = v_code or join_code_mentor = v_code);
  end loop;

  if p_which = 'student' then
    update public.teams set join_code_student = v_code, updated_at = now() where id = p_team_id;
  else
    update public.teams set join_code_mentor = v_code, updated_at = now() where id = p_team_id;
  end if;

  return v_code;
end;
$$;

create or replace function public.update_team_info(p_team_id uuid, p_team_number text, p_team_name text, p_district text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mentor_of(p_team_id) then
    raise exception 'Only a mentor can edit team info.';
  end if;
  update public.teams
    set team_number = trim(p_team_number),
        team_name = nullif(trim(p_team_name), ''),
        district = nullif(p_district, ''),
        updated_at = now()
    where id = p_team_id;
end;
$$;

-- Mentors can set any student's (or captain's) subteam/captain roles. A
-- team_captain can do the same but only for student rows -- never their
-- own, never a mentor's -- which is what gives the Team Captain role its
-- extra "roster edit" permission without letting it escalate to mentor.
create or replace function public.set_member_roles(p_user_id uuid, p_subteam text, p_captain_roles text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_target_team_id uuid;
  v_target_role text;
begin
  select team_id into v_team_id from public.team_members where user_id = auth.uid();
  select team_id, role into v_target_team_id, v_target_role from public.team_members where user_id = p_user_id;

  if v_team_id is null or v_target_team_id is distinct from v_team_id then
    raise exception 'That person is not on your team.';
  end if;
  if not (public.is_mentor_of(v_team_id) or (public.is_team_captain_of(v_team_id) and v_target_role = 'student')) then
    raise exception 'You do not have permission to change that.';
  end if;

  update public.team_members set subteam = p_subteam, captain_roles = p_captain_roles where user_id = p_user_id;
end;
$$;

create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_target_team_id uuid;
  v_target_role text;
begin
  if p_user_id = auth.uid() then
    raise exception 'Use "Leave team" to remove yourself.';
  end if;

  select team_id into v_team_id from public.team_members where user_id = auth.uid();
  select team_id, role into v_target_team_id, v_target_role from public.team_members where user_id = p_user_id;

  if v_team_id is null or v_target_team_id is distinct from v_team_id then
    raise exception 'That person is not on your team.';
  end if;
  if not (public.is_mentor_of(v_team_id) or (public.is_team_captain_of(v_team_id) and v_target_role = 'student')) then
    raise exception 'You do not have permission to remove that person.';
  end if;

  delete from public.team_members where user_id = p_user_id;
end;
$$;

create or replace function public.promote_to_mentor(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_target_team_id uuid;
begin
  select team_id into v_team_id from public.team_members where user_id = auth.uid();
  if v_team_id is null or not public.is_mentor_of(v_team_id) then
    raise exception 'Only a mentor can promote someone to mentor.';
  end if;
  select team_id into v_target_team_id from public.team_members where user_id = p_user_id;
  if v_target_team_id is distinct from v_team_id then
    raise exception 'That person is not on your team.';
  end if;

  update public.team_members set role = 'mentor', captain_roles = '{}' where user_id = p_user_id;
end;
$$;

-- Archives the team's current shared blob into season_history, then
-- clears just the parts of it that are meant to reset each year
-- (completed grants, checklist/calendar progress, and who's assigned to
-- what) -- team settings like roster size, mechanisms, and Open Alliance
-- preferences carry over, since those describe the team rather than the
-- season.
create or replace function public.start_new_season(p_team_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_data jsonb;
  v_year int;
begin
  if not public.is_mentor_of(p_team_id) then
    raise exception 'Only a mentor can start a new season.';
  end if;

  select data into v_data from public.team_data where team_id = p_team_id;
  select current_season_year into v_year from public.teams where id = p_team_id;

  insert into public.season_history (team_id, season_label, data)
    values (p_team_id, v_year || '-' || (v_year + 1), coalesce(v_data, '{}'::jsonb));

  update public.team_data
    set data = (coalesce(v_data, '{}'::jsonb) - 'progress' - 'completedGrants' - 'assignments'),
        updated_at = now()
    where team_id = p_team_id;

  update public.teams set current_season_year = v_year + 1, updated_at = now() where id = p_team_id;
end;
$$;

grant execute on function public.create_team(text, text, text) to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.leave_team() to authenticated;
grant execute on function public.delete_team() to authenticated;
grant execute on function public.regenerate_join_code(uuid, text) to authenticated;
grant execute on function public.update_team_info(uuid, text, text, text) to authenticated;
grant execute on function public.set_member_roles(uuid, text, text[]) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.promote_to_mentor(uuid) to authenticated;
grant execute on function public.start_new_season(uuid) to authenticated;
