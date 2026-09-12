# Auth, Roles, and the `(app)` Route Group — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member can sign up, confirm their email, log in, register for a session, and see confirmed/waitlisted status; a host can create a session, see its roster, and override a participant's status.

**Architecture:** Two migrations first (move `phone` off the member-readable `profiles` table; split the overloaded error codes), then the app layer. Public session pages render from a cookie-free anon Supabase client under ISR; everything per-user goes through Server Actions against a cookie-bearing session client, with a `server-only` Data Access Layer doing its own auth check at every query. RLS is the enforcement layer — `proxy.ts` and role checks in the UI are convenience only.

**Tech Stack:** Next.js 16.3.4 (App Router, `proxy.ts`, typed `PageProps`/`LayoutProps`/`RouteContext`), React 19.2, Supabase (`@supabase/ssr` 0.12, `@supabase/supabase-js` 2.116), Tailwind 4 + shadcn/ui (new-york, neutral), react-hook-form 7.87 + zod 4.5.4, Vitest (to be added), pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-12-auth-and-app-shell-design.md`

## Global Constraints

- Work on branch `dev`. Commit after every task.
- **Never** `.insert()` into `public.participants` from any client or server code, and never add an INSERT policy or grant to it. All participant writes go through `register_for_session`, `cancel_registration`, `host_add_participant`, `host_set_participant_status` via `supabase.rpc()`. The advisory lock is airtight only because those RPCs are the sole write path.
- Map RPC failures from `PostgrestError.code` only. Never string-match `error.message`.
- Error code contract after Task 2: JB001 registration not open · JB002 session full · JB003 already registered / nothing to cancel · JB004 not authenticated · JB005 invalid match player · JB006 wrong transaction isolation · JB007 not authorized · JB008 session or participant not found.
- RLS is the authorization layer. Use the user's session client. The service-role key is for admin scripts only and must never be imported by anything under `app/`.
- Types are generated: `npx supabase gen types typescript --local > types/supabase.ts`. Regenerate after every schema change. Never hand-edit `types/supabase.ts` — the only permitted post-generation edit is removing CLI diagnostic lines the command appends past the final `} as const` (observed in Task 1: `Connecting to db 5432`, a `MaxListenersExceededWarning`, and its trace hint). They appear intermittently. After every regeneration run `npx tsc --noEmit` (project-wide, using the repo's tsconfig — not `tsc --noEmit types/supabase.ts`, which type-checks the file in isolation and misses integration problems); a clean result means the file is intact, and a parse error points straight at the trailing junk to delete.
- One zod schema per entity in `lib/validation/`, imported by both the client `zodResolver` and the Server Action that handles the same form.
- Server Actions + RLS is the default. No Realtime channels in this plan.
- **Never modify `.env.local`.** It is gitignored and untracked, so an overwrite is unrecoverable — there is no git copy to restore from. It holds whatever credentials the developer has chosen, which may point at a remote project rather than local Supabase. If a task needs different environment values to verify something, say so and stop; do not edit the file.
- Local Supabase uses remapped ports (db 54332, API 54331, Studio 54333). Read the live URL with `npx supabase status -o env`. Never hardcode a port.
- Next.js 16 differs from older training data: the middleware file convention is now `proxy.ts`, and `PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>` are globally available generated types that need no import. Read `node_modules/next/dist/docs/` before reaching for a remembered API.
- `supabase/config.toml` sets `site_url = "http://127.0.0.1:3000"`. Develop against `http://127.0.0.1:3000`, not `localhost`, or auth redirects will be rejected.

**Deviation from the spec, applied throughout:** the spec sketched auth actions at `app/(auth)/actions.ts`. Server Actions live in `lib/actions/*.ts` instead, because the registration actions are called from a `(marketing)` client island and colocating them inside `(auth)` or `(app)` would misplace them. Everything else follows the spec.

## File Structure

**Database**
- `supabase/migrations/20260912000014_profiles_private.sql` — new table, grants, policies, trigger change
- `supabase/migrations/20260912000015_error_codes.sql` — five recreated raise sites
- `supabase/tests/013_profiles_private.test.sql` — new pgTAP file
- `supabase/tests/002_profiles.test.sql`, `010_registration.test.sql`, `012_invariant_fixes.test.sql` — assertions repinned to new codes
- `supabase/seed.sql` — passwords + confirmed emails so seeded accounts can actually log in
- `supabase/config.toml`, `supabase/templates/confirmation.html` — email confirmation on, token_hash template, Google block disabled

**Shared modules**
- `lib/validation/auth.ts` · `lib/validation/profile.ts` · `lib/validation/session.ts`
- `lib/errors/rpc.ts` — JB code → typed code + message
- `lib/actions/result.ts` — `ActionResult<T>` and constructors (pure, no `'use server'`)
- `lib/actions/auth.ts` · `registration.ts` · `profile.ts` · `sessions.ts` · `participants.ts` (each `'use server'`)
- `lib/supabase/public.ts` — anon, cookie-free, for ISR routes only
- `lib/supabase/server.ts`, `client.ts`, `middleware.ts` — existing, gain `Database` generics
- `lib/dal/user.ts` · `sessions.ts` · `participants.ts` · `profile.ts` — session client, `import 'server-only'`
- `lib/dal/public-sessions.ts` — public client only; kept in its own file so no cached route can accidentally reach the session client

**Routes**
- `app/(auth)/login/page.tsx` · `signup/page.tsx` · `layout.tsx`
- `app/auth/confirm/route.ts` · `callback/route.ts` · `error/page.tsx`
- `app/(marketing)/sessions/page.tsx` · `sessions/[id]/page.tsx`
- `app/api/sessions/[id]/my-registration/route.ts`
- `app/(app)/layout.tsx` · `dashboard/page.tsx` · `profile/page.tsx` · `sessions/new/page.tsx` · `sessions/[id]/manage/page.tsx`
- `proxy.ts` — existing, gains the optimistic redirect

**Components**
- `components/auth/login-form.tsx` · `signup-form.tsx` · `google-button.tsx` · `sign-out-button.tsx`
- `components/sessions/session-card.tsx` · `register-panel.tsx` (client island) · `session-form.tsx` · `roster-table.tsx`
- `components/profile/profile-form.tsx`

**Tests**
- `vitest.config.mts` · `tests/unit/validation.test.ts` · `tests/unit/rpc-errors.test.ts`

---

### Task 1: Move `phone` to `profiles_private`

Closes the finding that any signed-up account can walk roster → profile and harvest every phone number in the community. RLS is row-level, so hiding a column from a visible row is impossible — the column has to move.

**Files:**
- Create: `supabase/migrations/20260912000014_profiles_private.sql`
- Create: `supabase/tests/013_profiles_private.test.sql`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: existing `public.profiles`, `public.participants`, `public.is_admin()`, `public.is_session_host(uuid)`, `public.set_updated_at()`, `public.handle_new_user()`
- Produces: table `public.profiles_private(user_id uuid pk, phone text, created_at, updated_at)`; policies `profiles_private_select_self_admin_or_host`, `profiles_private_update_self`. `public.profiles` no longer has a `phone` column.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/013_profiles_private.test.sql`:

```sql
begin;
select plan(13);

select has_table('public', 'profiles_private', 'profiles_private table exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles_private'::regclass),
  true,
  'RLS is enabled on profiles_private'
);

select hasnt_column('public', 'profiles', 'phone', 'phone no longer lives on profiles');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pp-member@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'pp-other@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'pp-host@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'pp-otherhost@test.local'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'pp-admin@test.local');

select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'a profiles_private row is created alongside the profile'
);

update public.profiles set role = 'host'
 where id in ('aaaaaaaa-0000-0000-0000-000000000003',
              'aaaaaaaa-0000-0000-0000-000000000004');
update public.profiles set role = 'admin'
 where id = 'aaaaaaaa-0000-0000-0000-000000000005';

update public.profiles_private set phone = '+628111000001'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by,
   status, registration_state)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Hosted session',
   now() + interval '1 day', now() + interval '1 day 2 hours', 'GOR A', 8,
   'aaaaaaaa-0000-0000-0000-000000000003', 'scheduled', 'open'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Unrelated session',
   now() + interval '2 days', now() + interval '2 days 2 hours', 'GOR B', 8,
   'aaaaaaaa-0000-0000-0000-000000000004', 'scheduled', 'open');

-- direct insert: this test runs as the table owner, which bypasses RLS.
-- Application code must never do this (the RPCs are the only write path).
insert into public.participants (session_id, user_id, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'confirmed'),
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'cancelled');

set local role authenticated;

-- self
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select phone from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '+628111000001',
  'a member can read their own phone'
);
select lives_ok(
  $$ update public.profiles_private set phone = '+628111000099'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'a member can update their own phone'
);

-- another member
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'another member cannot read that phone'
);

-- host of a session the member is confirmed in
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'a host can read the phone of a participant in their session'
);
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'a host cannot read the phone of a cancelled participant'
);

-- host of an unrelated session
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'a host of an unrelated session cannot read that phone'
);

-- admin
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles_private
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1,
  'an admin can read any phone'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'public.profiles_private', 'insert'),
  'authenticated has no INSERT grant on profiles_private'
);

select ok(
  not has_table_privilege('anon', 'public.profiles_private', 'select'),
  'anon has no SELECT grant on profiles_private'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
npx supabase db reset && npx supabase test db
```

Expected: `013_profiles_private` fails at the first assertion — relation `public.profiles_private` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260912000014_profiles_private.sql`:

```sql
-- phone moves off public.profiles.
--
-- profiles_select_authenticated is `using (true)` and the participant policy
-- exposes full rosters, so while phone lived on profiles any signed-up account
-- could walk roster -> profile and harvest every phone number in the community.
-- Both policies are individually correct; the composition was the problem, and
-- RLS is row-level so no policy can hide one column of a visible row. The
-- column has to live somewhere with its own policy.

create table public.profiles_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_private_set_updated_at
before update on public.profiles_private
for each row execute function public.set_updated_at();

insert into public.profiles_private (user_id, phone)
select id, phone from public.profiles
on conflict (user_id) do nothing;

alter table public.profiles drop column phone;

-- keep the 1:1 invariant the profile row already has, so the profile form can
-- do a plain UPDATE and never an upsert
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

  insert into public.profiles_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- backfill rows for any profile that predates this migration
insert into public.profiles_private (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

alter table public.profiles_private enable row level security;

-- authoritative privilege set, not whatever Supabase's defaults granted.
-- No INSERT grant: the SECURITY DEFINER trigger owns row creation.
-- No DELETE grant: the cascade from profiles owns removal.
revoke all on public.profiles_private from anon, authenticated;
grant select, update on public.profiles_private to authenticated;

-- A cancelled participant drops out of host visibility immediately. A host who
-- ran a session keeps access to that player's phone after it completes -- they
-- need to reach no-shows after the fact.
create policy profiles_private_select_self_admin_or_host on public.profiles_private
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.participants p
      where p.user_id = profiles_private.user_id
        and p.status <> 'cancelled'
        and public.is_session_host(p.session_id)
    )
  );

create policy profiles_private_update_self on public.profiles_private
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx supabase db reset && npx supabase test db
```

Expected: `013_profiles_private` passes all 13 assertions, and every pre-existing file still passes. If `002_profiles` fails on a `phone` reference, fix that reference here.

- [ ] **Step 5: Regenerate types**

```bash
npx supabase gen types typescript --local > types/supabase.ts
grep -n "profiles_private" types/supabase.ts | head
```

Expected: `profiles_private` appears under `Tables`, and `phone` no longer appears under `profiles`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912000014_profiles_private.sql \
        supabase/tests/013_profiles_private.test.sql types/supabase.ts
git commit -m "feat(db): move phone to profiles_private with its own policy"
```

---

### Task 2: Split the overloaded error codes

JB004 currently means both "not authenticated" (401) and "not authorized" (403), which need opposite responses and cannot be told apart by a Server Action. "Not found" is currently smeared across JB001 and JB003.

**Files:**
- Create: `supabase/migrations/20260912000015_error_codes.sql`
- Modify: `supabase/tests/002_profiles.test.sql`, `supabase/tests/010_registration.test.sql`, `supabase/tests/012_invariant_fixes.test.sql`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Consumes: `public.register_for_session`, `public.host_add_participant`, `public.host_set_participant_status`, `public.guard_profile_role_change`
- Produces: the final JB001–JB008 contract. Signatures and return types are unchanged; only `errcode` values move.

The five sites, all currently in `supabase/migrations/20260911000010_registration.sql` except the last:

| File:line | Statement | Was | Becomes |
|---|---|---|---|
| `20260911000010_registration.sql:98` | `raise exception 'session not found'` | JB001 | JB008 |
| `20260911000010_registration.sql:208` | `raise exception 'not authorized'` (in `host_add_participant`) | JB004 | JB007 |
| `20260911000010_registration.sql:246` | `raise exception 'participant not found'` | JB003 | JB008 |
| `20260911000010_registration.sql:250` | `raise exception 'not authorized'` (in `host_set_participant_status`) | JB004 | JB007 |
| `20260911000002_profiles.sql:90` | `raise exception 'only an admin may change a role'` | JB004 | JB007 |

Everything else stays: JB004 on the two `'not authenticated'` raises, JB003 on `'already registered'` and `'no active registration'`, JB001 on `'registration is not open'`, JB002, JB005, JB006 untouched.

- [ ] **Step 1: Repin the existing assertions so they fail**

Find every assertion pinning a code that is about to move:

```bash
grep -rn "JB001\|JB003\|JB004" supabase/tests/
```

Edit each `throws_ok(...)` whose subject appears in the table above to expect the new code. Leave assertions on `'registration is not open'`, `'already registered'`, `'no active registration'`, and the two `'not authenticated'` raises alone.

- [ ] **Step 2: Run the suite and watch it fail**

```bash
npx supabase test db
```

Expected: failures reporting the old code where the test now expects the new one — for example `died: JB004` against an expectation of `JB007`. Each failure confirms an assertion that genuinely covers a site you are about to change. Count them; you should see one per repinned assertion.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260912000015_error_codes.sql`. For each of the four functions, copy the **entire current body verbatim** out of its source migration and change only the `errcode` on the lines in the table above. Do not retype the bodies from memory — the isolation guards, the advisory lock, and the `clock_timestamp()` choice are all load-bearing, and a paraphrase will silently break race-safety that no pgTAP test can catch.

```bash
# read the exact current text before editing
sed -n '54,150p' supabase/migrations/20260911000010_registration.sql   # register_for_session
sed -n '185,228p' supabase/migrations/20260911000010_registration.sql  # host_add_participant
sed -n '229,268p' supabase/migrations/20260911000010_registration.sql  # host_set_participant_status
sed -n '78,100p'  supabase/migrations/20260911000002_profiles.sql      # guard_profile_role_change
```

Head the new migration with:

```sql
-- JB004 meant both "not authenticated" (401) and "not authorized" (403); a
-- Server Action needs to redirect for one and show a forbidden message for the
-- other, and could not tell them apart. Not-found was smeared across JB001 and
-- JB003. After this migration:
--
--   JB001 registration is not open
--   JB002 session is full
--   JB003 already registered, or nothing to cancel
--   JB004 not authenticated
--   JB005 invalid match player
--   JB006 wrong transaction isolation
--   JB007 not authorized
--   JB008 session or participant not found
--
-- Function bodies below are copied verbatim from migrations 0010 and 0002.
-- Only errcode values changed.
```

Then the four `create or replace function` statements. No grant changes — `create or replace` preserves them.

- [ ] **Step 4: Verify the whole suite passes**

```bash
npx supabase db reset && npx supabase test db
```

Expected: every file passes, including the repinned assertions.

- [ ] **Step 5: Verify the bodies did not drift**

```bash
diff <(sed -n '/create or replace function public.register_for_session/,/^\$\$;/p' \
        supabase/migrations/20260911000010_registration.sql) \
     <(sed -n '/create or replace function public.register_for_session/,/^\$\$;/p' \
        supabase/migrations/20260912000015_error_codes.sql)
```

Expected: exactly one differing line, the `errcode` on `'session not found'`. Repeat for the other three functions; each should show only its listed changes. Any other difference is an accidental edit — revert it.

- [ ] **Step 6: Re-prove race safety and regenerate types**

```bash
./scripts/test-concurrent-registration.sh
npx supabase gen types typescript --local > types/supabase.ts
```

Expected: the race script still reports a race-safe result. It is the only artefact that proves the property this schema exists for — a green pgTAP run is not a substitute, because every pgTAP file runs single-connection in one transaction and never contends the advisory lock.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260912000015_error_codes.sql supabase/tests types/supabase.ts
git commit -m "feat(db): split JB004 into 401/403 and add JB008 not-found"
```

---

### Task 3: Auth configuration, email template, and loggable seed accounts

Email confirmation is required for password signups. Without it, an attacker can register a password account on an address they do not control; when the real owner later signs in with Google, Supabase links the identities on the shared verified email and the attacker's password opens the owner's account. Confirmation closes that ordering.

**Files:**
- Modify: `supabase/config.toml`
- Create: `supabase/templates/confirmation.html`
- Modify: `supabase/seed.sql`
- Modify: `.env.example`

**Interfaces:**
- Produces: seeded accounts `admin@jakbar.local`, `host@jakbar.local`, `member@jakbar.local`, all with password `password123` and confirmed emails. Confirmation links point at `/auth/confirm?token_hash=...&type=email&next=...`, which Task 7 implements.

- [ ] **Step 1: Turn on confirmation and raise the password floor**

In `supabase/config.toml`:

- under `[auth]`, set `minimum_password_length = 8` (currently 6) so it matches the zod schema in Task 4
- under `[auth]`, set `additional_redirect_urls = ["http://127.0.0.1:3000/**", "http://localhost:3000/**"]`
- under `[auth.email]`, set `enable_confirmations = true`
- under `[auth.email]`, set `max_frequency = "1s"` (already the value; confirm it, or local resends will be rate-limited while testing)
- under `[auth.rate_limit]`, raise `email_sent = 30` — the default of 2 per hour will block you within minutes of manual testing

- [ ] **Step 2: Add the token_hash email template**

Supabase's default confirmation email points at `/auth/v1/verify`, which does not fit the SSR `verifyOtp({ token_hash, type })` flow. Create `supabase/templates/confirmation.html`:

```html
<h2>Confirm your email</h2>
<p>Welcome to Jakbar Twogether. Confirm your address to finish signing up.</p>
<p>
  <a
    href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard"
    >Confirm my email</a
  >
</p>
```

Register it in `supabase/config.toml`, directly after the `[auth.email]` block:

```toml
[auth.email.template.confirmation]
subject = "Confirm your Jakbar Twogether account"
content_path = "./supabase/templates/confirmation.html"
```

- [ ] **Step 3: Add the disabled Google block**

Append to `supabase/config.toml`:

```toml
# Disabled until Google Cloud credentials exist. Going live is two env vars and
# flipping `enabled` -- no code change; the callback route and the button ship
# in this slice.
[auth.external.google]
enabled = false
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_SECRET)"
redirect_uri = ""
skip_nonce_check = false
```

- [ ] **Step 4: Make the seeded accounts loggable**

`supabase/seed.sql` currently inserts `auth.users` rows with no password and no confirmed email, so none of them can sign in — and with confirmation now required, they cannot confirm either. Replace the opening insert with:

```sql
-- Local development seed. Never runs against production: `supabase db reset`
-- and `supabase start` are local-only commands.
--
-- All three accounts use the password `password123`. email_confirmed_at is set
-- directly because confirmation is required and these accounts never receive
-- a real email.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000a001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Admin"}'),
  ('00000000-0000-0000-0000-00000000b001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'host@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Host"}'),
  ('00000000-0000-0000-0000-00000000c001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'member@jakbar.local', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Local Member"}')
on conflict (id) do nothing;

-- Supabase requires a matching identity row for password sign-in to resolve
-- the account by email.
insert into auth.identities
  (id, user_id, provider_id, provider, identity_data, last_sign_in_at)
select id, id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now()
from auth.users
where id in ('00000000-0000-0000-0000-00000000a001',
             '00000000-0000-0000-0000-00000000b001',
             '00000000-0000-0000-0000-00000000c001')
on conflict do nothing;
```

Leave the existing `update public.profiles set role = ...` statements and the sample session insert exactly as they are. Add one line so the seeded member has a phone to exercise the new policy:

```sql
update public.profiles_private set phone = '+6281234567890'
 where user_id = '00000000-0000-0000-0000-00000000c001';
```

- [ ] **Step 5: Add the new environment variables**

Append to `.env.example`:

```
# Public origin used to build auth redirect URLs. Must match supabase/config.toml
# site_url. Local Supabase is configured for http://127.0.0.1:3000 — use that
# host in the browser, not localhost, or redirects are rejected.
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000

# Google OAuth — leave blank until credentials exist. The provider is disabled
# in supabase/config.toml; filling these and flipping `enabled` turns it on.
GOOGLE_CLIENT_ID=
GOOGLE_SECRET=
```

Add the same `NEXT_PUBLIC_SITE_URL` line to your local `.env.local`.

- [ ] **Step 6: Verify**

```bash
npx supabase stop && npx supabase start && npx supabase db reset
npx supabase status -o env | grep -i "API_URL\|INBUCKET"
psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" \
  -c "select email, email_confirmed_at is not null as confirmed from auth.users order by email;"
```

Expected: all three seeded accounts listed with `confirmed = t`. Note the Inbucket URL from the status output — Task 7 uses it to read confirmation emails.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/templates/confirmation.html supabase/seed.sql .env.example
git commit -m "feat(auth): require email confirmation, add token_hash template, seed loggable accounts"
```

---

### Task 4: Vitest and the zod schemas

One schema per entity, imported by both the client form resolver and the Server Action that handles it. These are pure functions, so they get real tests.

**Files:**
- Create: `vitest.config.mts`, `tests/unit/validation.test.ts`
- Create: `lib/validation/auth.ts`, `lib/validation/profile.ts`, `lib/validation/session.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `lib/validation/auth.ts` — `signUpSchema`, `signInSchema`; types `SignUpInput`, `SignInInput`
  - `lib/validation/profile.ts` — `profileSchema`; type `ProfileInput`
  - `lib/validation/session.ts` — `sessionSchema`; type `SessionInput`
- Consumed by: Tasks 7 (auth), 8 (profile), 10 (session)

Note on zod 4.5.4, which differs from zod 3: `z.email()` and `z.url()` are top-level functions. `z.string().email()` still works but is deprecated — use the top-level form.

- [ ] **Step 1: Install Vitest and add the script**

```bash
npm install -D vitest
```

Add to `package.json` scripts:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

Create `vitest.config.mts`. The `.mts` extension is deliberate: `package.json` has no `"type": "module"`, so a `.ts` config is loaded as CommonJS while its contents are ESM, and Vite's native config loader warns on every single run. `tsconfig.json` already includes `**/*.mts`. Adding `"type": "module"` project-wide would also silence it but changes module resolution for the whole Next.js app, which is not worth it for a test config.

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    // __dirname does not exist in an ESM .mts module; import.meta.dirname is
    // its equivalent (Node 20.11+).
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/profile";
import { sessionSchema } from "@/lib/validation/session";

describe("signUpSchema", () => {
  const valid = {
    fullName: "Bagas Kara",
    email: "Bagas@Example.com ",
    password: "supersecret",
  };

  it("accepts a valid signup and normalises the email", () => {
    const result = signUpSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("bagas@example.com");
  });

  it("rejects a malformed email", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "short7c" }).success).toBe(false);
  });

  it("accepts a password of exactly 8 characters", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "exactly8" }).success).toBe(true);
  });

  it("rejects a one-character name", () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: "B" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts any non-empty password so old accounts can still log in", () => {
    const result = signInSchema.safeParse({ email: "a@b.com", password: "old" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a profile with no phone and no avatar", () => {
    const result = profileSchema.safeParse({ fullName: "Bagas", phone: "", avatarUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeNull();
  });

  it("accepts an Indonesian mobile number", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "+62 812 3456 7890",
      avatarUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a phone number containing letters", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "call me",
      avatarUrl: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an avatar value that is not a URL", () => {
    const result = profileSchema.safeParse({
      fullName: "Bagas",
      phone: "",
      avatarUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionSchema", () => {
  const valid = {
    title: "Friday Night Badminton",
    description: "",
    startsAt: "2026-10-02T19:00",
    endsAt: "2026-10-02T22:00",
    location: "GOR Jakarta Barat",
    locationUrl: "",
    courtCount: "4",
    maxParticipants: "16",
    waitlistCapacity: "4",
    registrationState: "open",
    status: "scheduled",
  };

  it("accepts a valid session and coerces the numeric fields", () => {
    const result = sessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courtCount).toBe(4);
      expect(result.data.maxParticipants).toBe(16);
    }
  });

  it("rejects an end time at or before the start time, on the endsAt field", () => {
    const result = sessionSchema.safeParse({ ...valid, endsAt: "2026-10-02T19:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "endsAt")).toBe(true);
    }
  });

  it("rejects a court count of zero, matching the CHECK constraint", () => {
    expect(sessionSchema.safeParse({ ...valid, courtCount: "0" }).success).toBe(false);
  });

  it("accepts a waitlist capacity of zero", () => {
    expect(sessionSchema.safeParse({ ...valid, waitlistCapacity: "0" }).success).toBe(true);
  });

  it("rejects a negative waitlist capacity", () => {
    expect(sessionSchema.safeParse({ ...valid, waitlistCapacity: "-1" }).success).toBe(false);
  });

  it("rejects a status a host is not allowed to set directly", () => {
    expect(sessionSchema.safeParse({ ...valid, status: "completed" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
npm run test:unit
```

Expected: every suite fails to resolve `@/lib/validation/...`.

- [ ] **Step 4: Write the schemas**

`lib/validation/auth.ts`:

```ts
import { z } from "zod";

// Matches minimum_password_length in supabase/config.toml. If one moves, move both.
const PASSWORD_MIN = 8;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  // zod 4 validates before it transforms, so `z.email().trim().toLowerCase()`
  // rejects " Bagas@Example.com " before the trim ever runs. Pipe the
  // normalisation in front of the validation instead.
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`),
});

// Deliberately not signUpSchema: an existing account may predate the current
// length floor, and rejecting it here would lock the owner out of their own
// login form rather than letting Supabase answer.
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
```

`lib/validation/profile.ts`:

```ts
import { z } from "zod";

// Deliberately permissive: the community spans Indonesian mobile, landline and
// the occasional foreign number. Reject obvious junk, do not enforce a country
// format we would have to keep patching.
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;

const optionalPhone = z
  .union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  phone: optionalPhone,
  avatarUrl: optionalUrl,
});

export type ProfileInput = z.infer<typeof profileSchema>;
```

`lib/validation/session.ts`:

```ts
import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(2000, "Description is too long")
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

export const sessionSchema = z
  .object({
    title: z.string().trim().min(3, "Give the session a title").max(120, "Title is too long"),
    description: optionalText,
    // datetime-local values, e.g. "2026-10-02T19:00" — no timezone suffix
    startsAt: z.string().min(1, "Pick a start time"),
    endsAt: z.string().min(1, "Pick an end time"),
    location: z.string().trim().min(3, "Where is it?").max(200, "Location is too long"),
    locationUrl: optionalUrl,
    // mirrors the court_count > 0 CHECK
    courtCount: z.coerce.number().int().min(1, "At least one court").max(20, "That is a lot of courts"),
    // mirrors the max_participants > 0 CHECK
    maxParticipants: z.coerce.number().int().min(1, "At least one player").max(200, "That is a lot of players"),
    // mirrors the waitlist_capacity >= 0 CHECK
    waitlistCapacity: z.coerce.number().int().min(0, "Cannot be negative").max(200, "That is a long waitlist"),
    registrationState: z.enum(["closed", "open"]),
    // a host creates drafts and scheduled sessions; live/completed/cancelled are
    // lifecycle transitions, not things you pick in a create form
    status: z.enum(["draft", "scheduled"]),
  })
  // mirrors the sessions_time_order CHECK so the form catches it before the DB does
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "End time must be after the start time",
    path: ["endsAt"],
  });

export type SessionInput = z.infer<typeof sessionSchema>;
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
npm run test:unit
```

Expected: all 17 tests pass.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.mts package.json package-lock.json tests/unit/validation.test.ts lib/validation
git commit -m "feat(validation): add zod schemas for auth, profile and session with unit tests"
```

---

### Task 5: RPC error mapper and `ActionResult`

The single place JB codes become user-facing outcomes. Reading `error.code` and never `error.message` is what keeps this from silently breaking when a message is reworded.

**Files:**
- Create: `lib/errors/rpc.ts`, `lib/actions/result.ts`, `tests/unit/rpc-errors.test.ts`

**Interfaces:**
- Produces:
  - `mapRpcError(error: { code?: string | null; message?: string } | null): MappedRpcError`
  - `type AppErrorCode` — the eight JB meanings plus `"validation"` and `"unknown"`
  - `type ActionResult<T> = { ok: true; data: T } | { ok: false; code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> }`
  - `ok(data)`, `fail(code, message, fieldErrors?)`, `failFromRpc(error)`, `failFromZod(error)`
- Consumed by: every Server Action in Tasks 7–10

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/rpc-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapRpcError } from "@/lib/errors/rpc";
import { failFromRpc, failFromZod, ok } from "@/lib/actions/result";

describe("mapRpcError", () => {
  const cases = [
    ["JB001", "registration_closed"],
    ["JB002", "session_full"],
    ["JB003", "registration_conflict"],
    ["JB004", "not_authenticated"],
    ["JB005", "invalid_match_player"],
    ["JB006", "wrong_isolation"],
    ["JB007", "not_authorized"],
    ["JB008", "not_found"],
  ] as const;

  it.each(cases)("maps %s to %s", (pgCode, appCode) => {
    expect(mapRpcError({ code: pgCode, message: "anything at all" }).code).toBe(appCode);
  });

  it("gives every mapped code a non-empty user-facing message", () => {
    for (const [pgCode] of cases) {
      expect(mapRpcError({ code: pgCode }).message.length).toBeGreaterThan(0);
    }
  });

  it("does not leak the raw database message for an internal failure", () => {
    const mapped = mapRpcError({ code: "JB006", message: "requires read committed isolation" });
    expect(mapped.message).not.toContain("isolation");
  });

  it("falls back to unknown for an unrecognised code", () => {
    expect(mapRpcError({ code: "23505", message: "duplicate key" }).code).toBe("unknown");
  });

  it("falls back to unknown for a null error", () => {
    expect(mapRpcError(null).code).toBe("unknown");
  });

  it("ignores the message entirely when deciding the code", () => {
    // a reworded database message must not change the outcome
    expect(mapRpcError({ code: "JB002", message: "no room left" }).code).toBe("session_full");
  });
});

describe("ActionResult", () => {
  it("wraps a success", () => {
    expect(ok({ id: "abc" })).toEqual({ ok: true, data: { id: "abc" } });
  });

  it("turns an rpc error into a failure carrying the mapped code", () => {
    const result = failFromRpc({ code: "JB007", message: "not authorized" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_authorized");
  });

  it("turns a zod error into field errors keyed by path", () => {
    const schema = z.object({ email: z.email(), name: z.string().min(2) });
    const parsed = schema.safeParse({ email: "nope", name: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = failFromZod(parsed.error);
    expect(result.code).toBe("validation");
    expect(result.fieldErrors?.email?.length).toBeGreaterThan(0);
    expect(result.fieldErrors?.name?.length).toBeGreaterThan(0);
  });

  it("files a top-level zod issue under _form", () => {
    const schema = z
      .object({ a: z.number(), b: z.number() })
      .refine((v) => v.b > v.a, { message: "b must exceed a" });
    const parsed = schema.safeParse({ a: 2, b: 1 });
    if (parsed.success) throw new Error("expected a failure");

    expect(failFromZod(parsed.error).fieldErrors?._form?.[0]).toBe("b must exceed a");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm run test:unit
```

Expected: `rpc-errors.test.ts` fails to resolve `@/lib/errors/rpc`.

- [ ] **Step 3: Write the mapper**

`lib/errors/rpc.ts`:

```ts
// The JB codes are raised by the SECURITY DEFINER registration RPCs. Map off
// error.code only -- never error.message. The messages are internal wording and
// have already been reworded once; the codes are the contract.
//
//   JB001 registration is not open
//   JB002 session is full
//   JB003 already registered, or nothing to cancel
//   JB004 not authenticated
//   JB005 invalid match player
//   JB006 wrong transaction isolation
//   JB007 not authorized
//   JB008 session or participant not found

export const RPC_CODE_MAP = {
  JB001: "registration_closed",
  JB002: "session_full",
  JB003: "registration_conflict",
  JB004: "not_authenticated",
  JB005: "invalid_match_player",
  JB006: "wrong_isolation",
  JB007: "not_authorized",
  JB008: "not_found",
} as const;

export type RpcErrorCode = (typeof RPC_CODE_MAP)[keyof typeof RPC_CODE_MAP];
export type AppErrorCode = RpcErrorCode | "validation" | "unknown";

const MESSAGES: Record<AppErrorCode, string> = {
  registration_closed: "Registration for this session is not open.",
  session_full: "This session is full.",
  // JB003 is still overloaded between "already registered" and "nothing to
  // cancel". Both mean the caller acted on a stale view, so one message covers
  // them; splitting the code would buy copy, not behaviour.
  registration_conflict: "Your registration changed. Reload the page and try again.",
  not_authenticated: "Please log in to continue.",
  invalid_match_player: "That player cannot be added to this match.",
  // JB006 means the RPC ran under the wrong transaction isolation. That is a
  // programming error, never the user's doing, so it gets a generic message and
  // the detail goes to the log.
  wrong_isolation: "Something went wrong on our side. Please try again.",
  not_authorized: "You do not have permission to do that.",
  not_found: "We could not find that.",
  validation: "Please check the highlighted fields.",
  unknown: "Something went wrong. Please try again.",
};

export type MappedRpcError = {
  code: AppErrorCode;
  message: string;
  /** Raw database message, for server-side logging only. Never render this. */
  detail?: string;
};

export function mapRpcError(
  error: { code?: string | null; message?: string } | null | undefined,
): MappedRpcError {
  const pgCode = error?.code ?? "";
  const code: AppErrorCode =
    pgCode in RPC_CODE_MAP ? RPC_CODE_MAP[pgCode as keyof typeof RPC_CODE_MAP] : "unknown";

  return { code, message: MESSAGES[code], detail: error?.message };
}

export function messageForCode(code: AppErrorCode): string {
  return MESSAGES[code];
}
```

- [ ] **Step 4: Write the result type**

`lib/actions/result.ts` — note there is no `'use server'` here. This file exports types and synchronous helpers, which a `'use server'` module is not allowed to do.

```ts
import type { ZodError } from "zod";
import { mapRpcError, messageForCode, type AppErrorCode } from "@/lib/errors/rpc";

export type ActionSuccess<T> = { ok: true; data: T };

export type ActionFailure = {
  ok: false;
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function fail(
  code: AppErrorCode,
  message?: string,
  fieldErrors?: Record<string, string[]>,
): ActionFailure {
  return { ok: false, code, message: message ?? messageForCode(code), fieldErrors };
}

export function failFromRpc(
  error: { code?: string | null; message?: string } | null | undefined,
): ActionFailure {
  const mapped = mapRpcError(error);
  if (mapped.code === "unknown" || mapped.code === "wrong_isolation") {
    console.error("[rpc]", mapped.code, error?.code, mapped.detail);
  }
  return { ok: false, code: mapped.code, message: mapped.message };
}

// Built from error.issues rather than a flatten helper so this keeps working
// across zod minor versions.
export function failFromZod(error: ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fail("validation", undefined, fieldErrors);
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
npm run test:unit
```

Expected: all tests pass, 34 total across both files.

- [ ] **Step 6: Commit**

```bash
git add lib/errors/rpc.ts lib/actions/result.ts tests/unit/rpc-errors.test.ts
git commit -m "feat(errors): map JB codes to typed action results"
```

---

### Task 6: Typed Supabase clients and the Data Access Layer

Three clients with non-overlapping jobs, and a `server-only` DAL so every RLS-facing query sits in one reviewable place.

**Files:**
- Create: `lib/supabase/public.ts`
- Modify: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `proxy.ts`
- Create: `lib/dal/user.ts`, `lib/dal/public-sessions.ts`, `lib/dal/sessions.ts`, `lib/dal/participants.ts`, `lib/dal/profile.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `createPublicClient(): SupabaseClient<Database>` — anon, cookie-free
  - `updateSession(request)` now returns `{ response: NextResponse; user: User | null }` (was: `NextResponse`)
  - `getCurrentUser(): Promise<CurrentUser | null>` where `CurrentUser = { id: string; email: string | null; fullName: string | null; avatarUrl: string | null; role: "member" | "host" | "admin" }`
  - `requireUser(nextPath: string): Promise<CurrentUser>` · `requireHost(nextPath: string): Promise<CurrentUser>`
  - `listUpcomingPublicSessions(): Promise<PublicSession[]>` · `getPublicSession(id): Promise<PublicSession | null>`
  - `getMyRegistration(sessionId): Promise<MyRegistration | null>` where `MyRegistration = { id: string; status: "confirmed" | "waiting_list" | "cancelled"; registeredAt: string; waitlistPosition: number | null }`
  - `listMyUpcomingRegistrations(): Promise<MyRegistrationRow[]>`
  - `listMyHostedSessions(): Promise<HostedSession[]>` · `getHostSession(id): Promise<HostedSession | null>`
  - `listRoster(sessionId): Promise<RosterEntry[]>`
  - `getMyProfile(): Promise<MyProfile | null>` where `MyProfile = { id, fullName, avatarUrl, phone, role }`
- Consumed by: Tasks 7–10

- [ ] **Step 1: Install `server-only`**

```bash
npm install server-only
```

- [ ] **Step 2: Add `Database` generics to the existing clients**

In `lib/supabase/server.ts` and `lib/supabase/client.ts`, import the generated types and parameterise the factory — `createServerClient<Database>(...)` and `createBrowserClient<Database>(...)`:

```ts
import type { Database } from "@/types/supabase";
```

Add a header comment to each stating its rule:

```ts
// Session client: reads and writes auth cookies, so any route that calls it
// renders dynamically. Use in Server Components, Server Actions and route
// handlers. Never import this from a route that sets `revalidate`.
```

```ts
// Browser client. Client islands only, and only where a server round trip
// genuinely cannot do the job. Ordinary CRUD belongs in a Server Action.
```

- [ ] **Step 3: Create the public client**

`lib/supabase/public.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Public client: anon key, no cookie adapter, no session persistence. Because it
// never touches cookies(), a route using it stays statically cached -- which is
// the whole point of the (marketing) route group. RLS gives anon read access to
// scheduled/live/completed sessions and their non-cancelled rosters.
//
// Never use this for anything per-user; it has no idea who is calling.
export function createPublicClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 4: Return the user from `updateSession`**

`proxy.ts` needs to know whether a session exists, and `updateSession` already calls `supabase.auth.getUser()` for token refresh. Return that result rather than calling it twice. In `lib/supabase/middleware.ts`, replace the final section:

```ts
  // Refreshing the auth token — do not run any code between
  // createServerClient and this call, and do not remove it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // IMPORTANT: return supabaseResponse as-is (or a new NextResponse created from
  // it, copying its cookies) so the refreshed session cookies reach the browser.
  return { response: supabaseResponse, user };
}
```

and change the signature to `export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }>`, importing `type User` from `@supabase/supabase-js`. In the early bail-out where Supabase is not configured, return `{ response: supabaseResponse, user: null }`.

This is a breaking change to a function `proxy.ts` already calls, and Task 7 does not rewrite `proxy.ts` until later. TypeScript will not catch it — `proxy`'s return type is inferred, so returning the wrapper object type-checks while breaking every request at runtime. So in the same task, update `proxy.ts` to destructure:

```ts
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}
```

Task 7 replaces this with the full version that also uses `user`. Leaving the tree runnable between tasks is worth the four-line edit.

- [ ] **Step 5: Write the user DAL**

`lib/dal/user.ts`:

```ts
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type Role = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role;
};

// React cache dedupes this within a single request, so a layout and the page
// inside it share one auth round trip.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getUser(), never getSession(): getSession() trusts the cookie contents
  // without verifying them against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    id: profile.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
  };
});

export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

// UX only. RLS is what actually stops a member reaching host data -- deleting
// this check must not make any data reachable that was not reachable before.
export async function requireHost(nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (user.role === "member") redirect("/dashboard");
  return user;
}
```

- [ ] **Step 6: Write the public sessions DAL**

`lib/dal/public-sessions.ts` — kept separate from `sessions.ts` so a cached route physically cannot reach the session client through it:

```ts
import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export type PublicSession = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string;
  locationUrl: string | null;
  courtCount: number;
  maxParticipants: number;
  waitlistCapacity: number;
  registrationState: "closed" | "open";
};

const COLUMNS =
  "id, title, description, starts_at, ends_at, location, location_url, court_count, max_participants, waitlist_capacity, registration_state";

type Row = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string;
  location_url: string | null;
  court_count: number;
  max_participants: number;
  waitlist_capacity: number;
  registration_state: "closed" | "open";
};

function toPublicSession(row: Row): PublicSession {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locationUrl: row.location_url,
    courtCount: row.court_count,
    maxParticipants: row.max_participants,
    waitlistCapacity: row.waitlist_capacity,
    registrationState: row.registration_state,
  };
}

export async function listUpcomingPublicSessions(): Promise<PublicSession[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(COLUMNS)
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(toPublicSession);
}

export async function getPublicSession(id: string): Promise<PublicSession | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.from("sessions").select(COLUMNS).eq("id", id).maybeSingle();

  // RLS hides a draft session from anon, which surfaces as no row rather than
  // an error -- that is a 404 to a visitor, not a failure.
  if (error) throw error;
  return data ? toPublicSession(data) : null;
}
```

- [ ] **Step 7: Write the participants DAL**

`lib/dal/participants.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type MyRegistration = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  /** 1-based queue position, null unless status is waiting_list */
  waitlistPosition: number | null;
};

export type MyRegistrationRow = MyRegistration & {
  sessionId: string;
  title: string;
  startsAt: string;
  location: string;
};

export type RosterEntry = {
  id: string;
  userId: string;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  addedBy: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

// waitlist_position_of() exists in the database but EXECUTE is revoked from
// authenticated, so count ahead-of-me rows instead. The participants SELECT
// policy makes non-cancelled rows of a public session readable, so this counts
// correctly under RLS.
async function waitlistPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  registeredAt: string,
): Promise<number> {
  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "waiting_list")
    .lt("registered_at", registeredAt);

  return (count ?? 0) + 1;
}

export async function getMyRegistration(sessionId: string): Promise<MyRegistration | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("participants")
    .select("id, status, registered_at")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || data.status === "cancelled") return null;

  return {
    id: data.id,
    status: data.status,
    registeredAt: data.registered_at,
    waitlistPosition:
      data.status === "waiting_list"
        ? await waitlistPosition(supabase, sessionId, data.registered_at)
        : null,
  };
}

export async function listMyUpcomingRegistrations(): Promise<MyRegistrationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select("id, session_id, status, registered_at, sessions!inner(title, starts_at, location)")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("sessions.starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true, referencedTable: "sessions" });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      registeredAt: row.registered_at,
      title: row.sessions.title,
      startsAt: row.sessions.starts_at,
      location: row.sessions.location,
      waitlistPosition:
        row.status === "waiting_list"
          ? await waitlistPosition(supabase, row.session_id, row.registered_at)
          : null,
    })),
  );
}

export async function listRoster(sessionId: string): Promise<RosterEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("participants")
    // profiles!inner would be ambiguous: participants has TWO foreign keys to
    // profiles (user_id and added_by). Name the constraint explicitly.
    .select("id, user_id, status, registered_at, checked_in_at, added_by, profiles!participants_user_id_fkey(full_name, avatar_url)")
    .eq("session_id", sessionId)
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    registeredAt: row.registered_at,
    checkedInAt: row.checked_in_at,
    addedBy: row.added_by,
    fullName: row.profiles.full_name,
    avatarUrl: row.profiles.avatar_url,
  }));
}
```

- [ ] **Step 8: Write the sessions and profile DALs**

`lib/dal/sessions.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type SessionStatus = Database["public"]["Enums"]["session_status"];

export type HostedSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  maxParticipants: number;
  waitlistCapacity: number;
  courtCount: number;
  status: SessionStatus;
  registrationState: "closed" | "open";
};

const COLUMNS =
  "id, title, starts_at, ends_at, location, max_participants, waitlist_capacity, court_count, status, registration_state";

type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  max_participants: number;
  waitlist_capacity: number;
  court_count: number;
  status: SessionStatus;
  registration_state: "closed" | "open";
};

function toHostedSession(row: Row): HostedSession {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    maxParticipants: row.max_participants,
    waitlistCapacity: row.waitlist_capacity,
    courtCount: row.court_count,
    status: row.status,
    registrationState: row.registration_state,
  };
}

export async function listMyHostedSessions(): Promise<HostedSession[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${COLUMNS}, session_hosts!inner(user_id)`)
    .eq("session_hosts.user_id", user.id)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toHostedSession(row as unknown as Row));
}

// Returns null when the caller is not a host of this session: sessions_select
// hides drafts from non-hosts, and session_hosts is checked explicitly for the
// rest. RLS is the enforcement; this shapes it into a 404.
export async function getHostSession(id: string): Promise<HostedSession | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${COLUMNS}, session_hosts!inner(user_id)`)
    .eq("id", id)
    .eq("session_hosts.user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data ? toHostedSession(data as unknown as Row) : null;
}
```

`lib/dal/profile.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Role } from "@/lib/dal/user";

export type MyProfile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  role: Role;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // phone lives in profiles_private, readable only by self, an admin, or a host
  // of a session this user is a non-cancelled participant in.
  const { data } = await supabase
    .from("profiles_private")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    phone: data?.phone ?? null,
    role: user.role,
  };
}
```

- [ ] **Step 9: Verify it compiles**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors. If a Supabase relational select complains about its inferred shape, fix the select string rather than widening the type — a wrong join name is exactly what this check is for.

- [ ] **Step 10: Commit**

```bash
git add lib/supabase lib/dal package.json package-lock.json
git commit -m "feat(data): add typed supabase clients and the server-only DAL"
```

---

### Task 7: Sign up, log in, confirm, and the proxy guard

**Files:**
- Create: `lib/auth/redirect.ts`, `lib/actions/auth.ts`
- Create: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
- Create: `app/auth/confirm/route.ts`, `app/auth/callback/route.ts`, `app/auth/error/page.tsx`
- Create: `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, `components/auth/google-button.tsx`
- Modify: `proxy.ts`
- Create: `tests/unit/safe-next.test.ts`

**Interfaces:**
- Consumes: `signInSchema`, `signUpSchema` (Task 4); `ok`/`fail`/`failFromZod`/`ActionResult` (Task 5); `updateSession` returning `{ response, user }` (Task 6)
- Produces:
  - `safeNext(value: string | null | undefined): string` — pure, in `lib/auth/redirect.ts`
  - `signIn(input: SignInInput, next?: string): Promise<ActionResult<null>>` — redirects on success
  - `signUp(input: SignUpInput): Promise<ActionResult<{ needsConfirmation: true }>>`
  - `signOut(): Promise<never>` — redirects to `/`
  - `signInWithGoogle(next?: string): Promise<ActionResult<null>>` — redirects on success
- Consumed by: Task 8 (`signOut` in the app nav)

- [ ] **Step 1: Write the failing test for the redirect guard**

`?next=` comes from the URL, so it is attacker-controlled and must never become an off-site redirect. Create `tests/unit/safe-next.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";

describe("safeNext", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
  });

  it("keeps a path with a query string", () => {
    expect(safeNext("/sessions/abc?tab=roster")).toBe("/sessions/abc?tab=roster");
  });

  it("falls back to /dashboard when absent", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("rejects an absolute URL", () => {
    expect(safeNext("https://evil.example.com/steal")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.example.com")).toBe("/dashboard");
  });

  it("rejects a backslash-prefixed path, which some browsers normalise to //", () => {
    expect(safeNext("/\\evil.example.com")).toBe("/dashboard");
  });

  it("rejects a path that does not start with a slash", () => {
    expect(safeNext("dashboard")).toBe("/dashboard");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:unit
```

Expected: cannot resolve `@/lib/auth/redirect`.

- [ ] **Step 3: Write the guard**

`lib/auth/redirect.ts` — a plain module, not a `'use server'` file, so it can export a synchronous function:

```ts
export const DEFAULT_REDIRECT = "/dashboard";

// `next` arrives from the query string, so it is attacker-controlled. Only a
// single-slash absolute path is allowed: "//host" and "/\host" both leave the
// site, and some browsers normalise the backslash form into the protocol-
// relative one.
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT;
  // Control characters must be rejected FIRST. The WHATWG URL parser strips raw
  // tab, LF and CR before parsing, so "/\t/evil.example.com" resolves to
  // "https://evil.example.com/" — a protocol-relative URL a naive "//" check
  // never sees. The percent-encoded (%09) and space forms stay on-origin, so
  // tab/LF/CR are the live vectors.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return DEFAULT_REDIRECT;
  if (!value.startsWith("/")) return DEFAULT_REDIRECT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_REDIRECT;
  return value;
}
```

- [ ] **Step 4: Run it and verify it passes**

```bash
npm run test:unit
```

Expected: all 7 tests pass.

- [ ] **Step 5: Write the auth actions**

`lib/actions/auth.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "@/lib/validation/auth";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { safeNext } from "@/lib/auth/redirect";

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured;
  // Falling back silently in production would mail every user a confirmation
  // link pointing at localhost, with no error and no failing build.
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  }
  return "http://127.0.0.1:3000";
}

export async function signIn(input: SignInInput, next?: string): Promise<ActionResult<null>> {
  // re-parse server-side: the client resolver is a convenience, not a guarantee
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Supabase deliberately does not distinguish a wrong password from a
    // missing account. Do not try to; that difference is an account-enumeration
    // oracle.
    return fail("not_authenticated", "Email or password is incorrect.");
  }

  redirect(safeNext(next));
}

export async function signUp(input: SignUpInput): Promise<ActionResult<{ needsConfirmation: true }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // handle_new_user copies full_name out of raw_user_meta_data into profiles
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    return fail("unknown", "We could not create that account. Please try again.");
  }

  // Confirmation is required, so no session exists yet. Always report the same
  // outcome whether or not the address was already registered -- saying "that
  // email is taken" would leak membership.
  return ok({ needsConfirmation: true as const });
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(next?: string): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });

  if (error || !data.url) {
    // Expected until GOOGLE_CLIENT_ID/GOOGLE_SECRET exist and
    // [auth.external.google] enabled is flipped to true.
    return fail("unknown", "Google sign-in is not available yet.");
  }

  redirect(data.url);
}
```

- [ ] **Step 6: Write the two auth route handlers**

`app/auth/confirm/route.ts` — email links carry `token_hash`:

```ts
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // redirect() throws to unwind, so it must sit outside the error branch
    if (!error) redirect(next);
  }

  redirect("/auth/error?reason=invalid_link");
}
```

`app/auth/callback/route.ts` — OAuth carries `code`:

```ts
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/auth/error?reason=oauth_failed");
}
```

- [ ] **Step 7: Write the auth pages and forms**

`app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}
```

`components/auth/google-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/actions/auth";

export function GoogleButton({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await signInWithGoogle(next);
          if (!result.ok) toast.error(result.message);
        })
      }
    >
      Continue with Google
    </Button>
  );
}
```

`components/auth/login-form.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/actions/auth";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";
import { GoogleButton } from "@/components/auth/google-button";

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInInput>({
    // same schema the Server Action re-parses with
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await signIn(values, next);
      // A successful sign-in redirects, and Next resolves a redirecting Server
      // Action's promise to `undefined` — not to an ActionResult. The declared
      // return type says otherwise, so TypeScript cannot catch this: guard the
      // value itself or the happy path throws.
      if (result && !result.ok) {
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (field !== "_form") form.setError(field as keyof SignInInput, { message: messages[0] });
        }
        form.setError("root", { message: result.message });
      }
    }),
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back to Jakbar Twogether.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Logging in…" : "Log in"}
            </Button>
            <GoogleButton next={next} />
            <p className="text-sm text-muted-foreground">
              No account? <Link href="/signup" className="underline">Sign up</Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
```

`components/auth/signup-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/actions/auth";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import { GoogleButton } from "@/components/auth/google-button";

export function SignupForm() {
  // Signup does not redirect -- confirmation is required, so there is no session
  // yet and the user has to go read their email.
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await signUp(values);

      if (result.ok) {
        setSent(true);
        return;
      }

      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field !== "_form") form.setError(field as keyof SignUpInput, { message: messages[0] });
      }
      form.setError("root", { message: result.message });
    }),
  );

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link. Open it to finish creating your account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>Join the Jakbar Twogether community.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account…" : "Sign up"}
            </Button>
            <GoogleButton />
            <p className="text-sm text-muted-foreground">
              Already have an account? <Link href="/login" className="underline">Log in</Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
```

`app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
```

`app/(auth)/signup/page.tsx` renders `<SignupForm />` with no props.

`app/auth/error/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const REASONS: Record<string, string> = {
  invalid_link: "That confirmation link is invalid or has expired.",
  oauth_failed: "We could not complete that sign-in.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign-in problem</CardTitle>
          <CardDescription>{REASONS[key] ?? "Something went wrong signing you in."}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full"><Link href="/login">Back to login</Link></Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Add the optimistic proxy guard**

Replace `proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes in the (app) group. /sessions and /sessions/[id] are public, so this
// cannot be a plain /sessions prefix.
function isProtected(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/sessions/new") return true;
  if (/^\/sessions\/[^/]+\/manage$/.test(pathname)) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  // Optimistic UX only. Proxy runs on every request including prefetches, so it
  // reads the already-refreshed session and makes no extra query. Every (app)
  // page re-checks through the DAL, and RLS is the actual enforcement --
  // deleting this block must not make any data reachable.
  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;

    const redirectResponse = NextResponse.redirect(url);
    // carry the refreshed auth cookies onto the redirect, or the next request
    // starts from a stale session
    for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image files (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 9: Verify by hand against local Supabase**

```bash
npx supabase status -o env | grep -i inbucket   # note the mail UI URL
npm run dev
```

Walk it, at `http://127.0.0.1:3000` (not `localhost` — `site_url` is pinned to the IP):

1. Visit `/dashboard` while logged out → redirected to `/login?next=%2Fdashboard`.
2. Sign up at `/signup` with a fresh address → "Check your email".
3. Open the Inbucket URL, open the newest message, click the confirm link → lands on `/dashboard` (which 404s until Task 8; the URL is what matters here).
4. Log out is not built yet; clear cookies, then log in at `/login` as `member@jakbar.local` / `password123` → redirected to `/dashboard`.
5. Click "Continue with Google" → toast reading "Google sign-in is not available yet." That is the expected result while the provider is disabled.
6. Visit `/login?next=https://example.com` and log in → you land on `/dashboard`, never on example.com.

- [ ] **Step 10: Commit**

```bash
npx tsc --noEmit && npm run lint && npm run test:unit
git add lib/auth lib/actions/auth.ts app/\(auth\) app/auth components/auth proxy.ts tests/unit/safe-next.test.ts
git commit -m "feat(auth): add signup, login, email confirmation and the proxy guard"
```

---

### Task 8: The `(app)` shell, dashboard, and profile

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/profile/page.tsx`
- Create: `components/auth/sign-out-button.tsx`, `components/profile/profile-form.tsx`
- Create: `lib/actions/profile.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 6), `listMyUpcomingRegistrations` (Task 6), `getMyProfile` (Task 6), `profileSchema` (Task 4), `signOut` (Task 7)
- Produces: `updateProfile(input: ProfileInput): Promise<ActionResult<null>>`

- [ ] **Step 1: Write the profile action**

`lib/actions/profile.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function updateProfile(input: ProfileInput): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Two tables, two policies: profiles_update_self_or_admin covers the name and
  // avatar, profiles_private_update_self covers the phone. Neither write can
  // touch anyone else's row even if user.id were wrong -- RLS decides, not this
  // eq() filter.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, avatar_url: parsed.data.avatarUrl })
    .eq("id", user.id);

  if (profileError) return fail("unknown", "Could not save your profile.");

  // The row is guaranteed to exist: handle_new_user creates it with the profile.
  const { error: phoneError } = await supabase
    .from("profiles_private")
    .update({ phone: parsed.data.phone })
    .eq("user_id", user.id);

  if (phoneError) return fail("unknown", "Could not save your phone number.");

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return ok(null);
}
```

- [ ] **Step 2: Write the sign-out button**

`components/auth/sign-out-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(() => signOut())}>
      Sign out
    </Button>
  );
}
```

- [ ] **Step 3: Write the `(app)` layout**

`app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/dal/user";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy already redirected an anonymous visitor; this is the real check.
  // It also covers a session that expired between the proxy and the render.
  const user = await requireUser("/dashboard");
  const canHost = user.role === "host" || user.role === "admin";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">Jakbar Twogether</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/sessions">Sessions</Link>
          {canHost ? <Link href="/sessions/new">New session</Link> : null}
          <Link href="/profile">Profile</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.fullName ?? user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Write the dashboard**

`app/(app)/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal/user";
import { listMyUpcomingRegistrations } from "@/lib/dal/participants";
import { listMyHostedSessions } from "@/lib/dal/sessions";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const registrations = await listMyUpcomingRegistrations();
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Your upcoming sessions</h1>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. <Link href="/sessions" className="underline">Browse sessions</Link>.
          </p>
        ) : (
          registrations.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link href={`/sessions/${row.sessionId}`}>{row.title}</Link>
                  {row.status === "confirmed" ? (
                    <Badge>Confirmed</Badge>
                  ) : (
                    <Badge variant="secondary">Waitlist #{row.waitlistPosition}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {new Date(row.startsAt).toLocaleString()} · {row.location}
                </CardDescription>
              </CardHeader>
            </Card>
          ))
        )}
      </section>

      {hosted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Sessions you host</h2>
          {hosted.map((session) => (
            <Card key={session.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={`/sessions/${session.id}/manage`}>{session.title}</Link>
                </CardTitle>
                <CardDescription>
                  {new Date(session.startsAt).toLocaleString()} · {session.location} ·{" "}
                  {session.status} · registration {session.registrationState}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Capacity {session.maxParticipants} · waitlist {session.waitlistCapacity}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Write the profile form and page**

`components/profile/profile-form.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/actions/profile";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

// The schema turns "" into null on output, so the form's input type and its
// output type differ. react-hook-form takes both.
type ProfileFormValues = z.input<typeof profileSchema>;

export function ProfileForm({ defaultValues }: { defaultValues: ProfileFormValues }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileFormValues, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateProfile(values);

      if (result.ok) {
        toast.success("Profile saved");
        return;
      }

      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field !== "_form") form.setError(field as keyof ProfileFormValues, { message: messages[0] });
      }
      form.setError("root", { message: result.message });
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>How you appear to hosts and other players.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="tel" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    Only you, an admin, and the hosts of sessions you join can see this.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avatar URL</FormLabel>
                  <FormControl>
                    <Input type="url" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
```

`app/(app)/profile/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getMyProfile } from "@/lib/dal/profile";
import { requireUser } from "@/lib/dal/user";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  await requireUser("/profile");
  const profile = await getMyProfile();
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-md">
      <ProfileForm
        defaultValues={{
          fullName: profile.fullName ?? "",
          phone: profile.phone ?? "",
          avatarUrl: profile.avatarUrl ?? "",
        }}
      />
    </div>
  );
}
```

Note the cast: `profileSchema` transforms `""` into `null` on output, so the form's *input* type differs from `ProfileInput`. Type the form as `useForm<z.input<typeof profileSchema>, unknown, ProfileInput>` so react-hook-form knows both sides.

- [ ] **Step 6: Verify by hand**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

1. Log in as `member@jakbar.local` → `/dashboard` renders with no registrations and no host section.
2. `/profile` shows the seeded phone `+6281234567890`.
3. Change the name and phone, save → toast appears; reload shows the new values; the header name updates.
4. Enter `call me` as the phone → the field shows "Enter a valid phone number" and never reaches the server.
5. Log in as `host@jakbar.local` → the header shows "New session" and the dashboard shows the seeded Friday session under "Sessions you host".
6. Sign out → back on `/`, and `/dashboard` redirects to login again.

- [ ] **Step 7: Confirm the phone policy actually holds**

The UI cannot prove this; query as the other member directly.

```bash
psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" <<'SQL'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
-- the host of the seeded session, with the member not yet registered
select count(*) as host_can_see_member_phone from public.profiles_private
 where user_id = '00000000-0000-0000-0000-00000000c001';
SQL
```

Expected: `0` — the seeded member has not registered for anything yet, so no host may read their phone. Re-run this after Task 9 once the member has registered; it must then return `1`.

- [ ] **Step 8: Commit**

```bash
git add app/\(app\) components/auth/sign-out-button.tsx components/profile lib/actions/profile.ts
git commit -m "feat(app): add the app shell, dashboard and profile editing"
```

---

### Task 9: Public session pages and registration

The cached-page half of the rendering split, plus the RPC-backed registration flow.

**Files:**
- Create: `app/(marketing)/sessions/page.tsx`, `app/(marketing)/sessions/[id]/page.tsx`
- Create: `app/api/sessions/[id]/my-registration/route.ts`
- Create: `lib/actions/registration.ts`
- Create: `components/sessions/session-card.tsx`, `components/sessions/register-panel.tsx`

**Interfaces:**
- Consumes: `listUpcomingPublicSessions`, `getPublicSession` (Task 6); `getMyRegistration` (Task 6); `failFromRpc`, `ok` (Task 5)
- Produces:
  - `registerForSession(sessionId: string): Promise<ActionResult<{ status: "confirmed" | "waiting_list"; waitlistPosition: number | null }>>`
  - `cancelRegistration(sessionId: string): Promise<ActionResult<null>>`
  - `GET /api/sessions/[id]/my-registration` → `{ registration: MyRegistration | null }`, or 401 with `{ registration: null }`

- [ ] **Step 1: Write the registration actions**

`lib/actions/registration.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, ok, type ActionResult } from "@/lib/actions/result";

export type RegisterOutcome = {
  status: "confirmed" | "waiting_list";
  waitlistPosition: number | null;
};

export async function registerForSession(sessionId: string): Promise<ActionResult<RegisterOutcome>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // The RPC is the ONLY write path into participants -- the table has no INSERT
  // policy and no INSERT grant on purpose. Everything that makes concurrent
  // registration safe (the advisory lock, the capacity re-read under READ
  // COMMITTED, clock_timestamp() ordering) lives inside this function. Never
  // replace this with an .insert().
  const { data, error } = await supabase.rpc("register_for_session", { p_session_id: sessionId });

  if (error) return failFromRpc(error);

  const status = data?.status;
  if (status !== "confirmed" && status !== "waiting_list") {
    return fail("unknown");
  }

  // The public session page shows capacity, not a live count, so it is not
  // revalidated here -- doing so on every registration would invalidate the ISR
  // cache continuously during a rush.
  revalidatePath("/dashboard");

  return ok({ status, waitlistPosition: data?.waitlist_position ?? null });
}

export async function cancelRegistration(sessionId: string): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Cancelling is also RPC-only. The waitlist promotion that follows is a
  // database trigger on the status change, so it fires identically whether the
  // cancellation came from here or from a host override.
  const { error } = await supabase.rpc("cancel_registration", { p_session_id: sessionId });

  if (error) return failFromRpc(error);

  revalidatePath("/dashboard");
  return ok(null);
}
```

- [ ] **Step 2: Write the route handler**

`app/api/sessions/[id]/my-registration/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getMyRegistration } from "@/lib/dal/participants";

// The session detail page is ISR-cached, so the server rendering it cannot know
// who is viewing. The register panel asks here after it hydrates. Routing this
// through a handler rather than querying Supabase from the browser keeps every
// query inside the DAL.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sessions/[id]/my-registration">) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ registration: null }, { status: 401 });
  }

  const registration = await getMyRegistration(id);

  return NextResponse.json(
    { registration },
    // per-user answer: never store it in any shared cache
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
```

- [ ] **Step 3: Write the register panel**

`components/sessions/register-panel.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelRegistration, registerForSession } from "@/lib/actions/registration";

type Registration = {
  id: string;
  status: "confirmed" | "waiting_list" | "cancelled";
  registeredAt: string;
  waitlistPosition: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "ready"; registration: Registration | null };

export function RegisterPanel({
  sessionId,
  registrationOpen,
}: {
  sessionId: string;
  registrationOpen: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/my-registration`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: "anonymous" });
          return;
        }
        const body = (await response.json()) as { registration: Registration | null };
        setState({ kind: "ready", registration: body.registration });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "ready", registration: null });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.kind === "loading") {
    return <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />;
  }

  if (state.kind === "anonymous") {
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(`/sessions/${sessionId}`)}`}>
          Log in to register
        </Link>
      </Button>
    );
  }

  const registration = state.registration;

  if (registration) {
    return (
      <div className="flex items-center gap-3">
        {registration.status === "confirmed" ? (
          <Badge>Confirmed</Badge>
        ) : (
          <Badge variant="secondary">Waitlist #{registration.waitlistPosition}</Badge>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelRegistration(sessionId);
              if (result.ok) {
                setState({ kind: "ready", registration: null });
                toast.success("Registration cancelled");
              } else {
                toast.error(result.message);
              }
            })
          }
        >
          Cancel registration
        </Button>
      </div>
    );
  }

  if (!registrationOpen) {
    return <p className="text-sm text-muted-foreground">Registration is not open for this session.</p>;
  }

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await registerForSession(sessionId);

          if (result.ok) {
            // the RPC already told us the outcome -- no refetch needed
            setState({
              kind: "ready",
              registration: {
                id: "pending",
                status: result.data.status,
                registeredAt: new Date().toISOString(),
                waitlistPosition: result.data.waitlistPosition,
              },
            });
            toast.success(
              result.data.status === "confirmed"
                ? "You are in."
                : `Added to the waitlist at #${result.data.waitlistPosition}.`,
            );
            return;
          }

          if (result.code === "not_authenticated") {
            window.location.href = `/login?next=${encodeURIComponent(`/sessions/${sessionId}`)}`;
            return;
          }

          toast.error(result.message);
        })
      }
    >
      Register
    </Button>
  );
}
```

- [ ] **Step 4: Write the public pages**

`components/sessions/session-card.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicSession } from "@/lib/dal/public-sessions";

export function SessionCard({ session }: { session: PublicSession }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link href={`/sessions/${session.id}`} className="hover:underline">
            {session.title}
          </Link>
          {session.registrationState === "open" ? (
            <Badge>Registration open</Badge>
          ) : (
            <Badge variant="outline">Registration closed</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {new Date(session.startsAt).toLocaleString()} · {session.location}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {/* capacity, not spots remaining -- see the comment on the detail page */}
        Capacity {session.maxParticipants} · waitlist {session.waitlistCapacity} · {session.courtCount} courts
      </CardContent>
    </Card>
  );
}
```

`app/(marketing)/sessions/page.tsx`:

```tsx
import type { Metadata } from "next";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { SessionCard } from "@/components/sessions/session-card";

// ISR. This route must never import lib/supabase/server -- touching cookies()
// would make it dynamic and forfeit the caching this route group exists for.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Upcoming sessions — Jakbar Twogether",
  description: "Badminton sessions open for registration in West Jakarta.",
};

export default async function SessionsPage() {
  const sessions = await listUpcomingPublicSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Upcoming sessions</h1>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions scheduled right now.</p>
      ) : (
        sessions.map((session) => <SessionCard key={session.id} session={session} />)
      )}
    </div>
  );
}
```

`app/(marketing)/sessions/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSession } from "@/lib/dal/public-sessions";
import { RegisterPanel } from "@/components/sessions/register-panel";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/sessions/[id]">): Promise<Metadata> {
  const { id } = await params;
  const session = await getPublicSession(id);
  if (!session) return { title: "Session not found" };

  const description = `${new Date(session.startsAt).toLocaleString()} · ${session.location}`;

  return {
    title: `${session.title} — Jakbar Twogether`,
    description,
    // this link gets pasted into WhatsApp, so the preview matters
    openGraph: { title: session.title, description, type: "website" },
  };
}

export default async function SessionDetailPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const session = await getPublicSession(id);
  if (!session) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        <p className="text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} – {new Date(session.endsAt).toLocaleTimeString()}
        </p>
        <p className="text-muted-foreground">
          {session.locationUrl ? (
            <a href={session.locationUrl} className="underline" rel="noreferrer noopener" target="_blank">
              {session.location}
            </a>
          ) : (
            session.location
          )}
        </p>
      </header>

      {session.description ? <p>{session.description}</p> : null}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Courts</dt>
        <dd>{session.courtCount}</dd>
        <dt className="text-muted-foreground">Capacity</dt>
        <dd>{session.maxParticipants}</dd>
        <dt className="text-muted-foreground">Waitlist</dt>
        <dd>{session.waitlistCapacity}</dd>
      </dl>

      {/* Spots remaining is deliberately absent: a live count here would force a
          revalidatePath on every registration and defeat the ISR cache. */}
      <RegisterPanel sessionId={session.id} registrationOpen={session.registrationState === "open"} />
    </div>
  );
}
```

- [ ] **Step 5: Check the route groups do not collide**

`/sessions` and `/sessions/[id]` live in `(marketing)`; `/sessions/new` and `/sessions/[id]/manage` live in `(app)`. Next errors only when two groups resolve to the *identical* path, and a static segment is matched ahead of a dynamic sibling, so this arrangement is legal — but confirm it rather than assume it, because the failure mode is a build-time error that is much cheaper to find now than after Task 10 adds the two `(app)` routes.

```bash
npm run build
```

Expected: a clean build listing `/sessions` and `/sessions/[id]` as static/ISR routes. If it reports two parallel pages resolving to the same path, move the host routes to `/host/sessions/...` and update `isProtected` in `proxy.ts` to match, before continuing.

- [ ] **Step 6: Verify the happy path by hand**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

1. Logged out, visit `/sessions` → the seeded "Friday Night Badminton" appears. Visit its detail page → "Log in to register".
2. Log in as `member@jakbar.local`, return to the detail page → a "Register" button.
3. Register → toast "You are in.", badge flips to Confirmed, button becomes "Cancel registration".
4. `/dashboard` now lists the session with a Confirmed badge.
5. Cancel → the panel returns to "Register"; the dashboard entry disappears.

- [ ] **Step 7: Verify the failure paths**

Each of these exercises a distinct JB code end to end.

```bash
PSQL="psql $(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
```

1. **JB001 (registration not open).** `$PSQL -c "update public.sessions set registration_state='closed';"` → reload the detail page; the panel reads "Registration is not open for this session." Set it back to `'open'`.
2. **JB002 (session full).** `$PSQL -c "update public.sessions set max_participants=1, waitlist_capacity=0;"`, register as one member, then register as a second → toast "This session is full." Restore `max_participants=16, waitlist_capacity=4`.
3. **Waitlist.** `$PSQL -c "update public.sessions set max_participants=1, waitlist_capacity=4;"`, register two different members → the second sees "Waitlist #1" and the dashboard shows the same. Restore the values.
4. **JB003 (stale view).** Register, then in `psql` set the row to `cancelled` behind the UI, then click "Cancel registration" → toast "Your registration changed. Reload the page and try again."
5. **JB004 (session expired mid-page).** Register, clear cookies in devtools without reloading, click Register → the browser navigates to `/login?next=/sessions/...`.

- [ ] **Step 8: Re-run the host phone check from Task 8**

With the member now registered for the host's session, re-run the query from Task 8 Step 7. Expected: `1` — the host can now read that member's phone, and only because of the registration.

- [ ] **Step 9: Confirm no direct participant writes exist**

```bash
grep -rnE "\.(insert|update|upsert|delete)\(" lib app components | grep -i participant
grep -rn -A3 'from("participants")' lib app components | grep -E "\.(insert|update|upsert|delete)\("
```

Expected: no results from either. The two forms catch a write reached through a variable and a write chained a few lines below the `.from()`. Any `.insert()`, `.update()`, `.upsert()` or `.delete()` on `participants` outside the RPCs is a defect — the advisory lock is airtight only because the RPCs are the sole write path.

- [ ] **Step 10: Commit**

```bash
npm run test:unit
git add "app/(marketing)/sessions" app/api components/sessions lib/actions/registration.ts
git commit -m "feat(sessions): add public session pages and RPC-backed registration"
```

---

### Task 10: Host session creation and roster management

**Files:**
- Create: `app/(app)/sessions/new/page.tsx`, `app/(app)/sessions/[id]/manage/page.tsx`
- Create: `components/sessions/session-form.tsx`, `components/sessions/roster-table.tsx`
- Create: `lib/actions/sessions.ts`, `lib/actions/participants.ts`

**Interfaces:**
- Consumes: `sessionSchema` (Task 4); `requireHost`, `getHostSession`, `listRoster` (Task 6); `failFromRpc` (Task 5)
- Produces:
  - `createSession(input: SessionInput): Promise<ActionResult<{ id: string }>>`
  - `setParticipantStatus(participantId: string, sessionId: string, status: "confirmed" | "waiting_list" | "cancelled"): Promise<ActionResult<null>>`

- [ ] **Step 1: Write the session action**

`lib/actions/sessions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { sessionSchema, type SessionInput } from "@/lib/validation/session";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function createSession(input: SessionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const values = parsed.data;

  // sessions_insert_host requires current_user_role() in ('host','admin') AND
  // created_by = auth.uid(). A member reaching this point is refused by RLS,
  // not by any check here. The sessions_add_owner trigger writes the
  // session_hosts owner row.
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      title: values.title,
      description: values.description,
      // datetime-local has no zone; the browser's zone is the intended one
      starts_at: new Date(values.startsAt).toISOString(),
      ends_at: new Date(values.endsAt).toISOString(),
      location: values.location,
      location_url: values.locationUrl,
      court_count: values.courtCount,
      max_participants: values.maxParticipants,
      waitlist_capacity: values.waitlistCapacity,
      registration_state: values.registrationState,
      status: values.status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // 42501 is an RLS refusal: a member tried to create a session.
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not create the session.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok({ id: data.id });
}
```

- [ ] **Step 2: Write the participant override action**

`lib/actions/participants.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, ok, type ActionResult } from "@/lib/actions/result";
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

// Host override. CLAUDE.md rule 3: every automated flow needs a host-facing
// manual counterpart, and waitlist promotion is already an automatic trigger.
//
// This goes through host_set_participant_status, not a direct UPDATE, even
// though participants_update_host would permit one. The RPC takes the same
// advisory lock as registration, so a host override and a member registration
// racing each other stay serialised.
export async function setParticipantStatus(
  participantId: string,
  sessionId: string,
  status: ParticipantStatus,
): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_set_participant_status", {
    p_participant_id: participantId,
    p_status: status,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${sessionId}/manage`);
  revalidatePath("/dashboard");
  return ok(null);
}
```

- [ ] **Step 3: Write the session form**

`components/sessions/session-form.tsx`. No Textarea or Select primitive is installed, so the description uses a plain `<textarea>` and the two enums use native `<select>` elements, both carrying the same border/height classes as `Input`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createSession } from "@/lib/actions/sessions";
import { sessionSchema, type SessionInput } from "@/lib/validation/session";

type SessionFormValues = z.input<typeof sessionSchema>;

const CONTROL_CLASS =
  "border-input bg-transparent flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none";

export function SessionForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<SessionFormValues, unknown, SessionInput>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      location: "",
      locationUrl: "",
      courtCount: "4",
      maxParticipants: "16",
      waitlistCapacity: "4",
      registrationState: "closed",
      status: "draft",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createSession(values);

      if (result.ok) {
        router.push(`/sessions/${result.data.id}/manage`);
        return;
      }

      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (field !== "_form") form.setError(field as keyof SessionFormValues, { message: messages[0] });
      }
      form.setError("root", { message: result.message });
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session details</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Friday Night Badminton" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      rows={3}
                      className={`${CONTROL_CLASS} h-auto`}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starts</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="GOR Jakarta Barat" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Map link</FormLabel>
                  <FormControl>
                    <Input type="url" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="courtCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Courts</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="waitlistCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waitlist</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="registrationState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration</FormLabel>
                    <FormControl>
                      <select className={CONTROL_CLASS} {...field}>
                        <option value="closed">Closed</option>
                        <option value="open">Open</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <select className={CONTROL_CLASS} {...field}>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </FormControl>
                    <FormDescription>
                      Draft sessions are visible only to you. Scheduled sessions appear publicly.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create session"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 4: Write the new-session page**

`app/(app)/sessions/new/page.tsx`:

```tsx
import { requireHost } from "@/lib/dal/user";
import { SessionForm } from "@/components/sessions/session-form";

export default async function NewSessionPage() {
  // UX gate only: a member who reaches this URL is bounced to /dashboard, and
  // even if they were not, sessions_insert_host would refuse the insert.
  await requireHost("/sessions/new");

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">New session</h1>
      <SessionForm />
    </div>
  );
}
```

- [ ] **Step 5: Write the roster table**

`components/sessions/roster-table.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setParticipantStatus } from "@/lib/actions/participants";

type Entry = {
  id: string;
  status: "confirmed" | "waiting_list" | "cancelled";
  registeredAt: string;
  fullName: string | null;
};

export function RosterTable({ sessionId, entries }: { sessionId: string; entries: Entry[] }) {
  const [pending, startTransition] = useTransition();

  const change = (participantId: string, status: Entry["status"]) =>
    startTransition(async () => {
      const result = await setParticipantStatus(participantId, sessionId, status);
      if (result.ok) toast.success("Participant updated");
      else toast.error(result.message);
    });

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has registered yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Registered</TableHead>
          <TableHead className="text-right">Override</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{entry.fullName ?? "Unnamed player"}</TableCell>
            <TableCell>
              {entry.status === "confirmed" ? (
                <Badge>Confirmed</Badge>
              ) : entry.status === "waiting_list" ? (
                <Badge variant="secondary">Waitlist</Badge>
              ) : (
                <Badge variant="outline">Cancelled</Badge>
              )}
            </TableCell>
            <TableCell>{new Date(entry.registeredAt).toLocaleString()}</TableCell>
            <TableCell className="flex justify-end gap-2">
              {entry.status !== "confirmed" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "confirmed")}>
                  Confirm
                </Button>
              ) : null}
              {entry.status !== "waiting_list" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "waiting_list")}>
                  Waitlist
                </Button>
              ) : null}
              {entry.status !== "cancelled" ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => change(entry.id, "cancelled")}>
                  Cancel
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 6: Write the manage page**

`app/(app)/sessions/[id]/manage/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireHost } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { listRoster } from "@/lib/dal/participants";
import { RosterTable } from "@/components/sessions/roster-table";

export default async function ManageSessionPage({ params }: PageProps<"/sessions/[id]/manage">) {
  const { id } = await params;
  await requireHost(`/sessions/${id}/manage`);

  // Null means RLS did not return the row -- either it does not exist or the
  // caller does not host it. Both are a 404 here; distinguishing them would tell
  // a stranger that a private session exists.
  const session = await getHostSession(id);
  if (!session) notFound();

  const roster = await listRoster(id);
  const confirmed = roster.filter((entry) => entry.status === "confirmed").length;
  const waiting = roster.filter((entry) => entry.status === "waiting_list").length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} · {session.location}
        </p>
        <p className="text-sm text-muted-foreground">
          {confirmed}/{session.maxParticipants} confirmed · {waiting}/{session.waitlistCapacity} waiting ·
          registration {session.registrationState}
        </p>
      </header>

      <RosterTable sessionId={session.id} entries={roster} />
    </div>
  );
}
```

- [ ] **Step 7: Verify by hand**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

1. Log in as `host@jakbar.local`, go to `/sessions/new`, create a session with status `scheduled` and registration `open` → you land on its manage page with an empty roster.
2. The new session appears on the public `/sessions` list within 60 seconds (the ISR window), or immediately on a hard reload since `createSession` revalidates that path.
3. Create a second session as a `draft` → it does **not** appear on `/sessions`, but does appear on your dashboard.
4. Set end time equal to start time → "End time must be after the start time" on the `endsAt` field, with no server round trip.
5. Log in as `member@jakbar.local` in a second browser profile, register for the scheduled session → it appears on the host's roster on reload.
6. As the host, click "Waitlist" on that member → the badge flips; the member's dashboard shows "Waitlist #1".
7. Click "Confirm" → it flips back.
8. As `member@jakbar.local`, visit `/sessions/new` → redirected to `/dashboard`.
9. As `member@jakbar.local`, visit the host's manage URL directly → 404, not a roster.

- [ ] **Step 8: Verify the override respects capacity rules**

```bash
PSQL="psql $(npx supabase status -o env | sed -n 's/^DB_URL=\"\(.*\)\"$/\1/p')"
$PSQL -c "select p.status, count(*) from public.participants p group by 1;"
```

Expected: counts match what the roster UI shows. Then confirm the trigger still promotes: with a full session and someone waiting, cancel a confirmed participant from the roster and check that the top waitlisted row becomes `confirmed` without any extra click — that promotion is the database trigger, not the UI.

- [ ] **Step 9: Full verification sweep**

```bash
npx supabase db reset
npx supabase test db
./scripts/test-concurrent-registration.sh
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
```

Expected: pgTAP fully green, the race script still reporting race-safe, unit tests green, no type or lint errors, and a clean production build. Do not claim the slice is done on anything less — paste the actual output.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/sessions" components/sessions lib/actions/sessions.ts lib/actions/participants.ts
git commit -m "feat(host): add session creation and roster management with manual overrides"
```

---

## Follow-ups this plan leaves open

Record these in `docs/superpowers/core-schema-follow-ups.md` when the slice lands, rather than losing them:

- Resend and React Email are unconfigured, so email confirmation works locally through Inbucket but not in any deployed environment. Must be wired before the first real user.
- Google OAuth ships disabled and has never been exercised end to end.
- No password reset flow exists.
- No admin UI: roles are changed by seed or by a service-role script.
- `host_add_participant` has no UI; it needs a member picker.
- No E2E coverage — signup, login, registration and override flows are verified by hand only.
- Everything carried forward from `core-schema-follow-ups.md` that this plan does not touch, notably `participants_update_host` being column-unrestricted and the absence of a mutation-style pass over the policies.
