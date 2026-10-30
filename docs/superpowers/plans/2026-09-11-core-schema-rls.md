# Core Schema + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete 🔴 Core Postgres foundation — tables, enums, RLS, concurrency-safe registration RPCs, waitlist promotion trigger — as Supabase migrations, proven by pgTAP tests and a parallel-registration race test.

**Architecture:** Twelve ordered migration files under `supabase/migrations/`, each paired with a pgTAP test file under `supabase/tests/`. Registration atomicity comes from `pg_advisory_xact_lock` keyed on the session id inside `SECURITY DEFINER` RPCs; RLS gives `participants` no INSERT policy, so those RPCs are the only write path. Waitlist promotion is an `AFTER UPDATE` row trigger, so it fires no matter who cancels.

**Tech Stack:** Postgres 17 (Supabase local, Docker), Supabase CLI 2.117.0, pgTAP via `supabase test db`, bash + psql for the race test.

**Spec:** `docs/superpowers/specs/2026-09-11-core-schema-rls-design.md`

## Global Constraints

- Every `SECURITY DEFINER` function MUST carry `SET search_path = public, pg_temp`. No exceptions — a definer function without a pinned search_path is a privilege-escalation vector.
- `EXECUTE` on helper and RPC functions is `REVOKE`d from `PUBLIC` and granted to `authenticated` only.
- `waitlist_capacity` is `NOT NULL DEFAULT 0`. Never nullable — `v_waiting < NULL` is NULL, which silently reads as "full".
- Custom SQLSTATEs: `JB001` registration closed / session not found, `JB002` session full, `JB003` already registered / no active registration, `JB004` not authorized, `JB005` invalid match player.
- Checked in ⇔ `checked_in_at IS NOT NULL`. There is no `checked_in` boolean.
- SQL keywords lowercase, one statement per line group, matching the style of the files as they are created in Task 1.
- Migrations are append-only once committed. If a later task needs to change an earlier table, it adds a new migration file — it does not edit a committed one.
- **Never hardcode the local DB port.** This machine runs more than one Supabase stack; port 54322 belongs to an unrelated project. This project's ports were remapped to the 5433x block in `supabase/config.toml` (db 54332, api 54331, studio 54333). Scripts derive the URL:
  `DB_URL="$(npx --no-install supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"`
  Any script that writes or deletes rows must first assert it is pointed at this project's database (see Task 12).

### Deviations from the spec (agreed during planning — the spec is being amended to match)

1. **Twelve migration files, not seven.** The spec's `0003_core_tables.sql` is split per domain so a reviewer can reject one table group while approving its neighbour, and `0005_rls_policies.sql` is split in two for the same reason.
2. **`current_user_role()` and `is_admin()` move to `0002_profiles.sql`.** They read only `profiles`, and the role-escalation guard trigger in that same file calls `is_admin()`. Only the session-scoped helpers need to wait for `session_hosts`.
3. **The role guard bypasses when `auth.uid()` is null.** Otherwise no migration, seed, or `service_role` call could ever set the first admin — the guard would lock the table against its own bootstrap. `service_role` already bypasses RLS, so this grants it nothing new.
4. **`JB005` added** for the `match_players` checked-in guard; the spec's error table lists only JB001–JB004.

### Test idioms used throughout

Every pgTAP file runs inside a transaction that `supabase test db` rolls back. To act as a user:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
```

To return to a privileged context: `set local role postgres;` and `set local request.jwt.claims = '';`

Fixed UUIDs used in every test file, so they mean the same thing everywhere:

```
11111111-1111-1111-1111-111111111111  member
22222222-2222-2222-2222-222222222222  host
33333333-3333-3333-3333-333333333333  admin
44444444-4444-4444-4444-444444444444  second member
```

---

### Task 1: Test loop, enums, and utilities

**Files:**
- Create: `supabase/migrations/20260911000001_enums_and_utils.sql`
- Test: `supabase/tests/001_enums_and_utils.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: enum types `user_role`, `session_status`, `registration_state`, `participant_status`, `session_host_role`, `court_status`, `match_status`; `public.set_updated_at() returns trigger`.

- [ ] **Step 1: Start the local stack and confirm the test loop runs at all**

```bash
npx supabase start
npx supabase test db
```

Expected: the stack boots (Docker 29.1.3 is installed), and `test db` reports no test files found. If `supabase start` fails, stop and report — every later step depends on it.

- [ ] **Step 2: Write the failing test**

Create `supabase/tests/001_enums_and_utils.test.sql`:

```sql
begin;
select plan(9);

select has_type('public', 'user_role', 'user_role enum exists');
select enum_has_labels('public', 'user_role', array['member','host','admin']);
select enum_has_labels('public', 'session_status', array['draft','scheduled','live','completed','cancelled']);
select enum_has_labels('public', 'registration_state', array['closed','open']);
select enum_has_labels('public', 'participant_status', array['confirmed','waiting_list','cancelled']);
select enum_has_labels('public', 'session_host_role', array['owner','cohost']);
select enum_has_labels('public', 'court_status', array['idle','in_use','unavailable']);
select enum_has_labels('public', 'match_status', array['scheduled','in_progress','completed','cancelled']);
select has_function('public', 'set_updated_at', 'set_updated_at() exists');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `type "public.user_role" does not exist` (or pgTAP reporting `has_type` not ok).

If instead it fails with `function plan(integer) does not exist`, pgTAP is not enabled. Add `create extension if not exists pgtap with schema extensions;` as the first line of the migration in Step 4 and re-run.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260911000001_enums_and_utils.sql`:

```sql
create type public.user_role as enum ('member', 'host', 'admin');
create type public.session_status as enum ('draft', 'scheduled', 'live', 'completed', 'cancelled');
create type public.registration_state as enum ('closed', 'open');
create type public.participant_status as enum ('confirmed', 'waiting_list', 'cancelled');
create type public.session_host_role as enum ('owner', 'cohost');
create type public.court_status as enum ('idle', 'in_use', 'unavailable');
create type public.match_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 9/9.

`db reset` re-applies migrations from scratch; use it after every new migration file so you are testing the real apply order, not a patched-up database.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911000001_enums_and_utils.sql supabase/tests/001_enums_and_utils.test.sql
git commit -m "feat(db): add core enums and updated_at helper"
```

---

### Task 2: Profiles, auth trigger, role helpers, role guard

**Files:**
- Create: `supabase/migrations/20260911000002_profiles.sql`
- Test: `supabase/tests/002_profiles.test.sql`

**Interfaces:**
- Consumes: `user_role`, `public.set_updated_at()` (Task 1).
- Produces: table `public.profiles(id uuid pk, full_name text, avatar_url text, phone text, role user_role, created_at, updated_at)`; `public.current_user_role() returns user_role`; `public.is_admin() returns boolean`; an `auth.users` insert trigger that creates the profile row.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/002_profiles.test.sql`:

```sql
begin;
select plan(8);

select has_table('public', 'profiles', 'profiles table exists');
select col_type_is('public', 'profiles', 'role', 'user_role', 'role is user_role');
select col_has_default('public', 'profiles', 'role', 'role has a default');

-- the auth.users trigger creates a profile automatically
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

select is(
  (select count(*)::int from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'profile row is created on auth.users insert'
);

update public.profiles set role = 'admin'
 where id = '33333333-3333-3333-3333-333333333333';

-- a member may edit their own name
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.profiles set full_name = 'Member One'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'member may edit their own profile'
);

select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'JB004',
  null,
  'member may not promote themselves'
);

select is(public.is_admin(), false, 'is_admin() is false for a member');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(public.is_admin(), true, 'is_admin() is true for an admin');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.profiles" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000002_profiles.sql`:

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- a profile always exists for an auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

revoke execute on function public.current_user_role(), public.is_admin() from public;
grant execute on function public.current_user_role(), public.is_admin() to authenticated;

-- RLS WITH CHECK cannot see OLD, so the no-self-promotion rule lives here.
-- auth.uid() is null for migrations, seeds, and service_role calls; those are
-- already unconstrained by RLS, and exempting them is what makes the first
-- admin bootstrappable at all.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only an admin may change a role' using errcode = 'JB004';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
before update on public.profiles
for each row execute function public.guard_profile_role_change();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 8/8 for this file and 9/9 for Task 1's.

If the `insert into auth.users (id, email)` fails on a NOT NULL column, add the columns the error names with literal values (`instance_id` `'00000000-0000-0000-0000-000000000000'`, `aud` `'authenticated'`, `role` `'authenticated'`) and record the working insert in the test file — later tasks copy it verbatim.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000002_profiles.sql supabase/tests/002_profiles.test.sql
git commit -m "feat(db): add profiles, auth trigger, and role-change guard"
```

---

### Task 3: Sessions and session_hosts

**Files:**
- Create: `supabase/migrations/20260911000003_sessions.sql`
- Test: `supabase/tests/003_sessions.test.sql`

**Interfaces:**
- Consumes: `public.profiles`, `session_status`, `registration_state`, `session_host_role`, `public.set_updated_at()`.
- Produces: tables `public.sessions`, `public.session_hosts`; an insert trigger that writes the `owner` row into `session_hosts`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/003_sessions.test.sql`:

```sql
begin;
select plan(6);

select has_table('public', 'sessions', 'sessions table exists');
select has_table('public', 'session_hosts', 'session_hosts table exists');
select col_default_is('public', 'sessions', 'waitlist_capacity', 0, 'waitlist_capacity defaults to 0');
select col_not_null('public', 'sessions', 'waitlist_capacity', 'waitlist_capacity is not null');

insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

select is(
  (select role::text from public.session_hosts
    where session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '22222222-2222-2222-2222-222222222222'),
  'owner',
  'creator is recorded as the session owner'
);

select throws_ok(
  $$ insert into public.sessions
       (title, starts_at, ends_at, location, max_participants, created_by)
     values ('Backwards', now() + interval '2 days', now() + interval '1 day',
             'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222') $$,
  '23514',
  null,
  'ends_at must be after starts_at'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.sessions" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000003_sessions.sql`:

```sql
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  location_url text,
  court_count int not null default 1 check (court_count > 0),
  max_participants int not null check (max_participants > 0),
  waitlist_capacity int not null default 0 check (waitlist_capacity >= 0),
  registration_state public.registration_state not null default 'closed',
  status public.session_status not null default 'draft',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_order check (ends_at > starts_at)
);

create index sessions_upcoming_idx
  on public.sessions (starts_at)
  where status = 'scheduled';

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

create table public.session_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.session_host_role not null default 'cohost',
  added_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index session_hosts_user_idx on public.session_hosts (user_id);

create or replace function public.add_session_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.session_hosts (session_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (session_id, user_id) do nothing;
  return new;
end;
$$;

create trigger sessions_add_owner
after insert on public.sessions
for each row execute function public.add_session_owner();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000003_sessions.sql supabase/tests/003_sessions.test.sql
git commit -m "feat(db): add sessions and session_hosts"
```

---

### Task 4: Participants

**Files:**
- Create: `supabase/migrations/20260911000004_participants.sql`
- Test: `supabase/tests/004_participants.test.sql`

**Interfaces:**
- Consumes: `public.sessions`, `public.profiles`, `participant_status`, `public.set_updated_at()`.
- Produces: table `public.participants` with `unique (session_id, user_id)` and the four indexes the RPCs and RLS depend on.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/004_participants.test.sql`:

```sql
begin;
select plan(5);

select has_table('public', 'participants', 'participants table exists');
select col_is_unique('public', 'participants', array['session_id','user_id'],
                     'one participant row per session per user');
select has_index('public', 'participants', 'participants_waitlist_order_idx',
                 'waitlist ordering index exists');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

insert into public.participants (session_id, user_id, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed');

select is(
  (select checked_in_at from public.participants
    where user_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'a new participant is not checked in'
);

select throws_ok(
  $$ insert into public.participants (session_id, user_id, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'waiting_list') $$,
  '23505',
  null,
  'a user cannot hold two rows for one session'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.participants" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000004_participants.sql`:

```sql
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.participant_status not null,
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index participants_session_status_idx
  on public.participants (session_id, status);

create index participants_waitlist_order_idx
  on public.participants (session_id, registered_at)
  where status = 'waiting_list';

create index participants_checked_in_idx
  on public.participants (session_id)
  where checked_in_at is not null;

create index participants_user_idx
  on public.participants (user_id, status);

create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000004_participants.sql supabase/tests/004_participants.test.sql
git commit -m "feat(db): add participants table and indexes"
```

---

### Task 5: Courts, matches, match_players

**Files:**
- Create: `supabase/migrations/20260911000005_courts_matches.sql`
- Test: `supabase/tests/005_courts_matches.test.sql`

**Interfaces:**
- Consumes: `public.sessions`, `public.participants`, `court_status`, `match_status`.
- Produces: tables `public.courts`, `public.matches`, `public.match_players`; `public.guard_match_player()` enforcing that a match player is a checked-in participant of the same session (JB005).

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/005_courts_matches.test.sql`:

```sql
begin;
select plan(5);

select has_table('public', 'courts', 'courts table exists');
select has_table('public', 'matches', 'matches table exists');
select has_table('public', 'match_players', 'match_players table exists');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222');

insert into public.courts (id, session_id, court_number)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 1);

insert into public.matches (id, session_id, court_id)
values ('cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.participants (id, session_id, user_id, status)
values ('dddddddd-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed');

select throws_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('cccccccc-0000-0000-0000-000000000001',
             'dddddddd-0000-0000-0000-000000000001', 1) $$,
  'JB005',
  null,
  'a participant who is not checked in cannot be put on a court'
);

update public.participants set checked_in_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into public.match_players (match_id, participant_id, team)
     values ('cccccccc-0000-0000-0000-000000000001',
             'dddddddd-0000-0000-0000-000000000001', 1) $$,
  'a checked-in participant can be put on a court'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.courts" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000005_courts_matches.sql`:

```sql
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_number int not null check (court_number > 0),
  status public.court_status not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, court_number)
);

create trigger courts_set_updated_at
before update on public.courts
for each row execute function public.set_updated_at();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  court_id uuid references public.courts (id) on delete set null,
  status public.match_status not null default 'scheduled',
  queue_position int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_session_status_idx on public.matches (session_id, status);

create index matches_active_court_idx
  on public.matches (court_id)
  where status = 'in_progress';

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  team smallint not null check (team in (1, 2)),
  primary key (match_id, participant_id)
);

create index match_players_participant_idx on public.match_players (participant_id);

-- Rule 4: matches operate on the checked-in pool, not the registration list.
create or replace function public.guard_match_player()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_match_session uuid;
  v_participant_session uuid;
  v_checked_in timestamptz;
begin
  select session_id into v_match_session
    from public.matches where id = new.match_id;

  select session_id, checked_in_at into v_participant_session, v_checked_in
    from public.participants where id = new.participant_id;

  if v_match_session is distinct from v_participant_session then
    raise exception 'participant belongs to a different session'
      using errcode = 'JB005';
  end if;

  if v_checked_in is null then
    raise exception 'participant is not checked in'
      using errcode = 'JB005';
  end if;

  return new;
end;
$$;

create trigger match_players_guard
before insert or update on public.match_players
for each row execute function public.guard_match_player();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000005_courts_matches.sql supabase/tests/005_courts_matches.test.sql
git commit -m "feat(db): add courts, matches, and checked-in player guard"
```

---

### Task 6: Announcements and galleries

**Files:**
- Create: `supabase/migrations/20260911000006_announcements_galleries.sql`
- Test: `supabase/tests/006_announcements_galleries.test.sql`

**Interfaces:**
- Consumes: `public.sessions`, `public.profiles`, `public.set_updated_at()`.
- Produces: tables `public.announcements`, `public.galleries`, `public.gallery_photos`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/006_announcements_galleries.test.sql`:

```sql
begin;
select plan(5);

select has_table('public', 'announcements', 'announcements table exists');
select has_table('public', 'galleries', 'galleries table exists');
select has_table('public', 'gallery_photos', 'gallery_photos table exists');
select col_is_null('public', 'announcements', 'session_id',
                   'session_id is nullable so an announcement can be community-wide');

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

insert into public.announcements (title, body, created_by)
values ('Community news', 'Sunday session moved', '33333333-3333-3333-3333-333333333333');

select is(
  (select count(*)::int from public.announcements where session_id is null),
  1,
  'a community-wide announcement can be written'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `relation "public.announcements" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000006_announcements_galleries.sql`:

```sql
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_community_idx
  on public.announcements (published_at desc)
  where session_id is null;

create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete set null,
  title text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger galleries_set_updated_at
before update on public.galleries
for each row execute function public.set_updated_at();

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index gallery_photos_order_idx
  on public.gallery_photos (gallery_id, sort_order);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000006_announcements_galleries.sql supabase/tests/006_announcements_galleries.test.sql
git commit -m "feat(db): add announcements and galleries"
```

---

### Task 7: Session-scoped RLS helpers

**Files:**
- Create: `supabase/migrations/20260911000007_rls_helpers.sql`
- Test: `supabase/tests/007_rls_helpers.test.sql`

**Interfaces:**
- Consumes: `public.sessions`, `public.session_hosts`, `public.is_admin()`.
- Produces: `public.is_session_host(uuid) returns boolean`, `public.is_session_owner(uuid) returns boolean`, `public.session_is_public(uuid) returns boolean`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/007_rls_helpers.test.sql`:

```sql
begin;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'cohost@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft');

insert into public.session_hosts (session_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', 'cohost');

set local role authenticated;

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'the owner is the session owner');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.is_session_host('aaaaaaaa-0000-0000-0000-000000000001'), true,
          'a cohost is a session host');
select is(public.is_session_owner('aaaaaaaa-0000-0000-0000-000000000001'), false,
          'a cohost is not the session owner');

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(public.session_is_public('aaaaaaaa-0000-0000-0000-000000000002'), false,
          'a draft session is not public');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.is_session_host(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000007_rls_helpers.sql`:

```sql
create or replace function public.is_session_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1 from public.session_hosts
     where session_id = p_session_id
       and user_id = auth.uid()
  );
$$;

create or replace function public.is_session_owner(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1 from public.session_hosts
     where session_id = p_session_id
       and user_id = auth.uid()
       and role = 'owner'
  );
$$;

create or replace function public.session_is_public(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions
     where id = p_session_id
       and status in ('scheduled', 'live', 'completed')
  );
$$;

revoke execute on function
  public.is_session_host(uuid),
  public.is_session_owner(uuid),
  public.session_is_public(uuid)
from public;

grant execute on function
  public.is_session_host(uuid),
  public.is_session_owner(uuid),
  public.session_is_public(uuid)
to authenticated, anon;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000007_rls_helpers.sql supabase/tests/007_rls_helpers.test.sql
git commit -m "feat(db): add session-scoped RLS helper functions"
```

---

### Task 8: RLS on profiles, sessions, session_hosts, participants

**Files:**
- Create: `supabase/migrations/20260911000008_rls_core.sql`
- Test: `supabase/tests/008_rls_core.test.sql`

**Interfaces:**
- Consumes: all helpers from Tasks 2 and 7.
- Produces: RLS enabled and policies in force on `profiles`, `sessions`, `session_hosts`, `participants`. **`participants` gets no INSERT policy and no member UPDATE policy** — later tasks rely on this.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/008_rls_core.test.sql`:

```sql
begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Draft Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'draft');

insert into public.participants (session_id, user_id, status, cancelled_at)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'confirmed', null),
       ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'cancelled', now());

select ok(
  (select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'RLS is enabled on participants'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.sessions),
  1,
  'a member sees the scheduled session but not the draft'
);

select throws_ok(
  $$ insert into public.participants (session_id, user_id, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'confirmed') $$,
  '42501',
  null,
  'a member cannot insert into participants directly'
);

-- the host's cancelled row exists (inserted above as postgres) but must be
-- invisible to this member; a vacuous 0 here would prove nothing
select is(
  (select count(*)::int from public.participants where status = 'cancelled'),
  0,
  'a member cannot see another user''s cancelled row'
);

select throws_ok(
  $$ insert into public.sessions
       (title, starts_at, ends_at, location, max_participants, created_by)
     values ('Member Session', now() + interval '3 days',
             now() + interval '3 days 2 hours', 'GOR Jakbar', 8,
             '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot create a session'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.sessions),
  2,
  'the host sees their own draft session'
);

select * from finish();
rollback;
```

Note: the host in this test has `role = 'member'` on their profile but owns the session through `session_hosts`, which is what the SELECT policy keys on. The session INSERT policy is the one that needs `role in ('host','admin')` — covered by the member case above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — the RLS-enabled assertion is false and the member can insert freely.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000008_rls_core.sql`:

```sql
grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_hosts enable row level security;
alter table public.participants enable row level security;

grant select, update on public.profiles to authenticated;
grant select on public.sessions to anon, authenticated;
grant insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.session_hosts to authenticated;
grant select, update, delete on public.participants to authenticated;

-- profiles
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- sessions
create policy sessions_select_public_or_host on public.sessions
  for select to anon, authenticated
  using (
    status in ('scheduled', 'live', 'completed')
    or public.is_session_host(id)
  );

create policy sessions_insert_host on public.sessions
  for insert to authenticated
  with check (
    public.current_user_role() in ('host', 'admin')
    and created_by = auth.uid()
  );

create policy sessions_update_host on public.sessions
  for update to authenticated
  using (public.is_session_host(id))
  with check (public.is_session_host(id));

create policy sessions_delete_host on public.sessions
  for delete to authenticated
  using (public.is_session_host(id));

-- session_hosts
create policy session_hosts_select_authenticated on public.session_hosts
  for select to authenticated
  using (true);

create policy session_hosts_insert_owner on public.session_hosts
  for insert to authenticated
  with check (public.is_session_owner(session_id));

create policy session_hosts_update_owner on public.session_hosts
  for update to authenticated
  using (public.is_session_owner(session_id))
  with check (public.is_session_owner(session_id));

create policy session_hosts_delete_owner on public.session_hosts
  for delete to authenticated
  using (public.is_session_owner(session_id));

-- participants
-- Deliberately no INSERT policy and no member UPDATE policy: registration and
-- cancellation go through the SECURITY DEFINER RPCs in task 10, which is what
-- makes the advisory lock the only possible path and therefore airtight.
create policy participants_select_self_host_or_public on public.participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_host(session_id)
    or (status <> 'cancelled' and public.session_is_public(session_id))
  );

create policy participants_update_host on public.participants
  for update to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

create policy participants_delete_host on public.participants
  for delete to authenticated
  using (public.is_session_host(session_id));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 6/6.

Earlier test files insert as `postgres`, which bypasses RLS — they should still pass. If any now fail, the cause is a missing `grant`, not a policy.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000008_rls_core.sql supabase/tests/008_rls_core.test.sql
git commit -m "feat(db): add RLS for profiles, sessions, hosts, and participants"
```

---

### Task 9: RLS on courts, matches, announcements, galleries

**Files:**
- Create: `supabase/migrations/20260911000009_rls_operations.sql`
- Test: `supabase/tests/009_rls_operations.test.sql`

**Interfaces:**
- Consumes: helpers from Task 7.
- Produces: RLS enabled and policies in force on `courts`, `matches`, `match_players`, `announcements`, `galleries`, `gallery_photos`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/009_rls_operations.test.sql`:

```sql
begin;
select plan(4);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local');

update public.profiles set role = 'admin'
 where id = '33333333-3333-3333-3333-333333333333';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '22222222-2222-2222-2222-222222222222', 'scheduled');

insert into public.courts (session_id, court_number)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1);

insert into public.galleries (id, title, created_by)
values ('eeeeeeee-0000-0000-0000-000000000001', 'Session photos',
        '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.courts),
  1,
  'a member can read courts of a public session'
);

select throws_ok(
  $$ insert into public.courts (session_id, court_number)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 2) $$,
  '42501',
  null,
  'a member cannot add a court'
);

select throws_ok(
  $$ insert into public.announcements (title, body, created_by)
     values ('Fake', 'Community-wide', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a member cannot post a community-wide announcement'
);

set local role anon;
set local request.jwt.claims = '';
select is(
  (select count(*)::int from public.galleries),
  1,
  'an anonymous visitor can read galleries'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — the member's inserts succeed because RLS is not yet enabled on these tables.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000009_rls_operations.sql`:

```sql
alter table public.courts enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.announcements enable row level security;
alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;

grant select, insert, update, delete on public.courts to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.match_players to authenticated;
grant select on public.announcements to anon;
grant select, insert, update, delete on public.announcements to authenticated;
grant select on public.galleries, public.gallery_photos to anon;
grant select, insert, update, delete on public.galleries to authenticated;
grant select, insert, update, delete on public.gallery_photos to authenticated;

-- courts
create policy courts_select on public.courts
  for select to authenticated
  using (public.session_is_public(session_id) or public.is_session_host(session_id));

create policy courts_write on public.courts
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

-- matches
create policy matches_select on public.matches
  for select to authenticated
  using (public.session_is_public(session_id) or public.is_session_host(session_id));

create policy matches_write on public.matches
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

-- match_players resolves its session through matches
create policy match_players_select on public.match_players
  for select to authenticated
  using (exists (
    select 1 from public.matches m
     where m.id = match_id
       and (public.session_is_public(m.session_id) or public.is_session_host(m.session_id))
  ));

create policy match_players_write on public.match_players
  for all to authenticated
  using (exists (
    select 1 from public.matches m
     where m.id = match_id and public.is_session_host(m.session_id)
  ))
  with check (exists (
    select 1 from public.matches m
     where m.id = match_id and public.is_session_host(m.session_id)
  ));

-- announcements
create policy announcements_select on public.announcements
  for select to anon, authenticated
  using (
    (published_at is not null
      and (session_id is null or public.session_is_public(session_id)))
    or (session_id is not null and public.is_session_host(session_id))
  );

create policy announcements_write on public.announcements
  for all to authenticated
  using (
    case when session_id is null
         then public.is_admin()
         else public.is_session_host(session_id)
    end
  )
  with check (
    case when session_id is null
         then public.is_admin()
         else public.is_session_host(session_id)
    end
  );

-- galleries
create policy galleries_select on public.galleries
  for select to anon, authenticated
  using (true);

create policy galleries_write on public.galleries
  for all to authenticated
  using (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  )
  with check (
    public.is_admin()
    or (session_id is not null and public.is_session_host(session_id))
  );

create policy gallery_photos_select on public.gallery_photos
  for select to anon, authenticated
  using (true);

create policy gallery_photos_write on public.gallery_photos
  for all to authenticated
  using (exists (
    select 1 from public.galleries g
     where g.id = gallery_id
       and (public.is_admin()
            or (g.session_id is not null and public.is_session_host(g.session_id)))
  ))
  with check (exists (
    select 1 from public.galleries g
     where g.id = gallery_id
       and (public.is_admin()
            or (g.session_id is not null and public.is_session_host(g.session_id)))
  ));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000009_rls_operations.sql supabase/tests/009_rls_operations.test.sql
git commit -m "feat(db): add RLS for courts, matches, announcements, galleries"
```

---

### Task 10: Registration RPCs and the waitlist promotion trigger

This is the task the whole design exists for. Read spec §6 and §7 before starting.

**Files:**
- Create: `supabase/migrations/20260911000010_registration.sql`
- Test: `supabase/tests/010_registration.test.sql`

**Interfaces:**
- Consumes: `public.participants`, `public.sessions`, `public.is_session_host(uuid)`.
- Produces: composite type `public.registration_result (status participant_status, waitlist_position int)`; `public.session_lock_key(uuid) returns bigint`; `public.register_for_session(uuid) returns public.registration_result`; `public.cancel_registration(uuid) returns void`; `public.host_add_participant(uuid, uuid, participant_status) returns public.participants`; `public.host_set_participant_status(uuid, participant_status) returns public.participants`; trigger `participants_promote_waitlist`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/010_registration.test.sql`:

```sql
begin;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'member@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'host@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'member2@test.local');

update public.profiles set role = 'host'
 where id = '22222222-2222-2222-2222-222222222222';

-- one seat, one waitlist slot
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Friday Night',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, 1, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'open'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Closed Session',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   'GOR Jakbar', 8, 2, '22222222-2222-2222-2222-222222222222',
   'scheduled', 'closed');

set local role authenticated;

-- first member takes the only seat
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select status::text from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001')),
  'confirmed',
  'the first registrant is confirmed'
);

select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB003',
  null,
  'registering twice raises JB003'
);

select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'JB001',
  null,
  'registering on a closed session raises JB001'
);

-- second member is waitlisted at position 1
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(
  (select status::text from public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001')),
  'waiting_list',
  'the second registrant is waitlisted'
);

-- third would exceed max_participants + waitlist_capacity
set local role postgres;
set local request.jwt.claims = '';
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'member3@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select throws_ok(
  $$ select public.register_for_session('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'JB002',
  null,
  'registering past both caps raises JB002'
);

-- the confirmed member cancels; the waitlisted member is promoted by trigger
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.cancel_registration('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'the confirmed member can cancel'
);

select is(
  (select status::text from public.participants
    where user_id = '44444444-4444-4444-4444-444444444444'),
  'confirmed',
  'the waitlisted member is promoted automatically on cancellation'
);

-- the host may exceed the cap manually
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select status::text from public.host_add_participant(
     'aaaaaaaa-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555',
     'confirmed')),
  'confirmed',
  'a host can add a participant beyond max_participants'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.register_for_session(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000010_registration.sql`:

```sql
create type public.registration_result as (
  status public.participant_status,
  waitlist_position int
);

-- One lock key per session. Registrations for different sessions never contend.
create or replace function public.session_lock_key(p_session_id uuid)
returns bigint
language sql
immutable
as $$
  select hashtextextended(p_session_id::text, 0);
$$;

create or replace function public.register_for_session(p_session_id uuid)
returns public.registration_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.sessions;
  v_existing public.participant_status;
  v_confirmed int;
  v_waiting int;
  v_status public.participant_status;
  v_registered_at timestamptz := now();
  v_result public.registration_result;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  -- Held until commit. Covers the count-then-insert window below, which is
  -- where "two people take the last slot" would otherwise live.
  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception 'session not found' using errcode = 'JB001';
  end if;

  if v_session.registration_state <> 'open' or v_session.status <> 'scheduled' then
    raise exception 'registration is not open' using errcode = 'JB001';
  end if;

  select status into v_existing
    from public.participants
   where session_id = p_session_id and user_id = v_user;

  if v_existing in ('confirmed', 'waiting_list') then
    raise exception 'already registered' using errcode = 'JB003';
  end if;

  select
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'waiting_list')
  into v_confirmed, v_waiting
  from public.participants
  where session_id = p_session_id;

  if v_confirmed < v_session.max_participants then
    v_status := 'confirmed';
  elsif v_waiting < v_session.waitlist_capacity then
    v_status := 'waiting_list';
  else
    raise exception 'session is full' using errcode = 'JB002';
  end if;

  insert into public.participants (session_id, user_id, status, registered_at)
  values (p_session_id, v_user, v_status, v_registered_at)
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        cancelled_at = null,
        added_by = null;

  v_result.status := v_status;

  if v_status = 'waiting_list' then
    select count(*) + 1 into v_result.waitlist_position
      from public.participants
     where session_id = p_session_id
       and status = 'waiting_list'
       and registered_at < v_registered_at;
  end if;

  return v_result;
end;
$$;

create or replace function public.cancel_registration(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  update public.participants
     set status = 'cancelled',
         cancelled_at = now()
   where session_id = p_session_id
     and user_id = v_user
     and status in ('confirmed', 'waiting_list');

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'no active registration' using errcode = 'JB003';
  end if;
end;
$$;

-- Rule 3: hosts always retain manual override. No capacity check here.
create or replace function public.host_add_participant(
  p_session_id uuid,
  p_user_id uuid,
  p_status public.participant_status default 'confirmed'
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.participants;
begin
  if not public.is_session_host(p_session_id) then
    raise exception 'not authorized' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  insert into public.participants
    (session_id, user_id, status, registered_at, added_by)
  values (p_session_id, p_user_id, p_status, now(), auth.uid())
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        registered_at = excluded.registered_at,
        cancelled_at = null,
        added_by = excluded.added_by
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.host_set_participant_status(
  p_participant_id uuid,
  p_status public.participant_status
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_row public.participants;
begin
  select session_id into v_session_id
    from public.participants where id = p_participant_id;

  if v_session_id is null then
    raise exception 'participant not found' using errcode = 'JB003';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB004';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  update public.participants
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end
   where id = p_participant_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Fires however the cancellation arrives: member RPC, host override, or an
-- admin's direct update. The WHEN clause is the recursion guard — the
-- promotion below is waiting_list -> confirmed, which does not re-match.
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_confirmed int;
begin
  perform pg_advisory_xact_lock(public.session_lock_key(new.session_id));

  select * into v_session from public.sessions where id = new.session_id;

  if v_session.status not in ('scheduled', 'live') then
    return null;
  end if;

  select count(*) into v_confirmed
    from public.participants
   where session_id = new.session_id and status = 'confirmed';

  if v_confirmed < v_session.max_participants then
    update public.participants
       set status = 'confirmed'
     where id = (
       select id from public.participants
        where session_id = new.session_id
          and status = 'waiting_list'
        order by registered_at
        limit 1
     );
  end if;

  return null;
end;
$$;

create trigger participants_promote_waitlist
after update on public.participants
for each row
when (old.status = 'confirmed' and new.status = 'cancelled')
execute function public.promote_from_waitlist();

revoke execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.host_add_participant(uuid, uuid, public.participant_status),
  public.host_set_participant_status(uuid, public.participant_status)
from public;

grant execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.host_add_participant(uuid, uuid, public.participant_status),
  public.host_set_participant_status(uuid, public.participant_status)
to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000010_registration.sql supabase/tests/010_registration.test.sql
git commit -m "feat(db): add atomic registration RPCs and waitlist promotion trigger"
```

---

### Task 11: Realtime publication

**Files:**
- Create: `supabase/migrations/20260911000011_realtime.sql`
- Test: `supabase/tests/011_realtime.test.sql`

**Interfaces:**
- Consumes: all tables.
- Produces: `sessions`, `participants`, `courts`, `matches`, `match_players` in the `supabase_realtime` publication with `replica identity full`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/011_realtime.test.sql`:

```sql
begin;
select plan(2);

select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('sessions','participants','courts','matches','match_players')),
  5,
  'all five live tables are in the realtime publication'
);

select is(
  (select count(*)::int
     from pg_class
    where relname in ('sessions','participants','courts','matches','match_players')
      and relnamespace = 'public'::regnamespace
      and relreplident = 'f'),
  5,
  'all five live tables use replica identity full'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — counts are 0, not 5.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260911000011_realtime.sql`:

```sql
-- replica identity full so UPDATE and DELETE events carry old values;
-- without it "player removed from court" arrives with no way to know who left.
alter table public.sessions replica identity full;
alter table public.participants replica identity full;
alter table public.courts replica identity full;
alter table public.matches replica identity full;
alter table public.match_players replica identity full;

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.courts;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_players;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, 2/2.

If the publication does not exist on a fresh local stack, create it first with `create publication supabase_realtime;` at the top of the migration.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000011_realtime.sql supabase/tests/011_realtime.test.sql
git commit -m "feat(db): publish live tables to realtime"
```

---

### Task 12: Parallel registration race test

The pgTAP suite runs in one transaction, so it can never prove the advisory lock works. This does.

**Files:**
- Create: `scripts/test-concurrent-registration.sh`

**Interfaces:**
- Consumes: `public.register_for_session(uuid)`, `public.cancel_registration(uuid)`.
- Produces: an executable script; exit code 0 on pass, 1 on failure.

- [ ] **Step 1: Write the script**

Create `scripts/test-concurrent-registration.sh`:

```bash
#!/usr/bin/env bash
# Proves rule 1: concurrent registrations cannot oversubscribe a session.
# Requires a running local stack (npx supabase start).
set -euo pipefail

# Derive the URL from the CLI — never hardcode a port. Another Supabase stack
# on this machine owns 54322, and this script issues DELETEs.
DB_URL="${DB_URL:-$(npx --no-install supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')}"
[ -n "$DB_URL" ] || { echo "FAIL: could not determine DB_URL; is the stack running?"; exit 1; }

# Refuse to touch a database that is not this project's.
GUARD=$(psql "$DB_URL" -At -c \
  "select coalesce(to_regclass('public.participants') is not null
                   and to_regproc('public.register_for_session') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL is not this project's database (no participants table / register_for_session)."
  echo "      Refusing to run destructive statements against it."
  exit 1
}

RACERS=20
SEATS=1
WAITLIST=3
SESSION_ID="aaaaaaaa-0000-0000-0000-00000000f001"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
delete from auth.users where email like 'race%@test.local';
delete from public.sessions where id = '$SESSION_ID';

insert into auth.users (id, email)
select gen_random_uuid(), 'race' || g || '@test.local'
  from generate_series(1, $RACERS) g;

insert into auth.users (id, email) values
  (gen_random_uuid(), 'racehost@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('$SESSION_ID', 'Race Session',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', $SEATS, $WAITLIST,
   (select id from auth.users where email = 'racehost@test.local'),
   'scheduled', 'open');
SQL

# Every racer waits for the same wall-clock instant, then fires. Without the
# barrier the processes trickle in and the race never actually happens.
START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '5 seconds')")

mapfile -t USER_IDS < <(psql "$DB_URL" -At -c \
  "select id from auth.users where email like 'race%@test.local' and email <> 'racehost@test.local' order by email")

for uid in "${USER_IDS[@]}"; do
  psql "$DB_URL" -q -At >/dev/null 2>&1 <<SQL &
begin;
select pg_sleep_until(to_timestamp($START_EPOCH));
set local role authenticated;
set local request.jwt.claims = '{"sub":"$uid","role":"authenticated"}';
select public.register_for_session('$SESSION_ID');
commit;
SQL
done
wait

CONFIRMED=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID' and status = 'confirmed'")
WAITING=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID' and status = 'waiting_list'")
TOTAL=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID'")

fail=0
[ "$CONFIRMED" = "$SEATS" ] || { echo "FAIL: expected $SEATS confirmed, got $CONFIRMED"; fail=1; }
[ "$WAITING" = "$WAITLIST" ] || { echo "FAIL: expected $WAITLIST waitlisted, got $WAITING"; fail=1; }
[ "$TOTAL" = "$((SEATS + WAITLIST))" ] || { echo "FAIL: expected $((SEATS + WAITLIST)) rows, got $TOTAL"; fail=1; }

# Promotion: the confirmed racer cancels, the oldest waitlister takes the seat.
CONFIRMED_ID=$(psql "$DB_URL" -At -c \
  "select user_id from public.participants where session_id = '$SESSION_ID' and status = 'confirmed'")
NEXT_UP=$(psql "$DB_URL" -At -c \
  "select user_id from public.participants where session_id = '$SESSION_ID' and status = 'waiting_list' order by registered_at limit 1")

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$CONFIRMED_ID","role":"authenticated"}';
select public.cancel_registration('$SESSION_ID');
commit;
SQL

PROMOTED=$(psql "$DB_URL" -At -c \
  "select status from public.participants where session_id = '$SESSION_ID' and user_id = '$NEXT_UP'")
[ "$PROMOTED" = "confirmed" ] || { echo "FAIL: expected promotion to confirmed, got $PROMOTED"; fail=1; }

NOW_CONFIRMED=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID' and status = 'confirmed'")
[ "$NOW_CONFIRMED" = "$SEATS" ] || { echo "FAIL: promotion oversubscribed: $NOW_CONFIRMED confirmed"; fail=1; }

if [ "$fail" = 0 ]; then
  echo "PASS: $RACERS racers, $CONFIRMED confirmed, $WAITING waitlisted, promotion in registered_at order"
fi
exit "$fail"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x scripts/test-concurrent-registration.sh
./scripts/test-concurrent-registration.sh
```

Expected: `PASS: 20 racers, 1 confirmed, 3 waitlisted, promotion in registered_at order`

- [ ] **Step 3: Prove the test can actually fail**

Temporarily comment out the `perform pg_advisory_xact_lock(...)` line in `register_for_session` (edit it in the database directly with `psql`, do not change the migration file), re-run the script, and confirm it reports more than one confirmed. Then `npx supabase db reset` to restore.

A race test that cannot fail is not a test. If it still passes with the lock removed, the barrier is not working — raise `RACERS` and re-check that `pg_sleep_until` is inside each transaction.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-concurrent-registration.sh
git commit -m "test(db): add parallel registration race test"
```

---

### Task 13: Seed, admin bootstrap, types, and documentation

**Files:**
- Create: `supabase/seed.sql`
- Modify: `types/supabase.ts` (regenerate, replacing the placeholder)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a seeded local dev environment; a real `Database` type for the app; documented production admin bootstrap.

- [ ] **Step 1: Write the seed**

Create `supabase/seed.sql`:

```sql
-- Local development seed. Never runs against production: `supabase db reset`
-- and `supabase start` are local-only commands.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@jakbar.local'),
  ('00000000-0000-0000-0000-00000000b001', 'host@jakbar.local'),
  ('00000000-0000-0000-0000-00000000c001', 'member@jakbar.local')
on conflict (id) do nothing;

-- auth.uid() is null here, so the role guard permits the bootstrap.
update public.profiles set role = 'admin', full_name = 'Local Admin'
 where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'host', full_name = 'Local Host'
 where id = '00000000-0000-0000-0000-00000000b001';
update public.profiles set full_name = 'Local Member'
 where id = '00000000-0000-0000-0000-00000000c001';

insert into public.sessions
  (title, starts_at, ends_at, location, court_count, max_participants,
   waitlist_capacity, created_by, status, registration_state)
values
  ('Friday Night Badminton',
   now() + interval '3 days', now() + interval '3 days 3 hours',
   'GOR Jakarta Barat', 4, 16, 4,
   '00000000-0000-0000-0000-00000000b001', 'scheduled', 'open');
```

Run `npx supabase db reset` and confirm the seed applies without error.

- [ ] **Step 2: Verify the seed and the full suite together**

```bash
npx supabase db reset
npx supabase test db
./scripts/test-concurrent-registration.sh
```

Expected: every pgTAP file passes and the race test prints PASS.

- [ ] **Step 3: Regenerate the database types**

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

Expected: `types/supabase.ts` now contains real `Tables`, `Enums`, and `Functions` entries — `register_for_session` among them — replacing the hand-written placeholder.

- [ ] **Step 4: Verify the app still compiles against the new types**

```bash
npx tsc --noEmit
```

Expected: no errors. `lib/supabase/client.ts` and `lib/supabase/server.ts` already import `Database` from this file.

- [ ] **Step 5: Document the production admin bootstrap**

Add to `README.md` under a new `## Database` heading:

```markdown
## Database

Local development:

```bash
npx supabase start          # boot Postgres, Auth, Realtime, Studio
npx supabase db reset       # apply all migrations + seed
npx supabase test db        # run the pgTAP suite
./scripts/test-concurrent-registration.sh   # prove registration is race-safe
```

This project's local ports are remapped to the 5433x block (db 54332, API 54331,
Studio 54333) so it can run alongside other Supabase projects on the same
machine — the default 5432x block is not assumed to be free. Read the live URL
with `npx supabase status -o env` rather than hardcoding a port.

After changing the schema, regenerate types:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

### First admin in production

`profiles.role` defaults to `member`, and only an admin may change a role, so
the first admin must be set manually — there is deliberately no "first user
becomes admin" rule, which would be a live privilege-escalation path on a
public signup form.

Sign up normally, then run once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```

The role-change guard exempts calls where `auth.uid()` is null, which is the
case for the SQL editor and any `service_role` connection.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql types/supabase.ts README.md
git commit -m "feat(db): add dev seed, generated types, and database docs"
```

---

## Verification checklist

Run before calling this plan done:

- [ ] `npx supabase db reset` applies all eleven migrations cleanly from scratch
- [ ] `npx supabase test db` passes every file
- [ ] `./scripts/test-concurrent-registration.sh` prints PASS
- [ ] The race test was observed FAILING with the advisory lock removed (Task 12, Step 3)
- [ ] `npx tsc --noEmit` is clean
- [ ] `grep -c 'security definer' supabase/migrations/*.sql` — every match also has `set search_path`
- [ ] `participants` still has no INSERT policy: `select count(*) from pg_policies where tablename='participants' and cmd='INSERT';` returns 0
