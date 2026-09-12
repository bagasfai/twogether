# Auth, Roles, and the `(app)` Route Group — Design

Date: 2026-09-12
Branch: `dev`
Predecessor: `2026-09-11-core-schema-rls-design.md` (13 migrations, 158/158 pgTAP, RLS enforced)

## 1. Purpose

The first 🔴 Core slice above the database. When this is done:

- a visitor can browse upcoming sessions and open one, from cached and SEO-indexable pages;
- a member can sign up, confirm their email, log in, register for a session, and see
  whether they are confirmed or waitlisted and at what position;
- a host can create a session, see its roster, and manually override a participant's status.

Out of scope, deliberately: admin screens, check-in, courts, matches, rotation, realtime,
announcements, galleries, WhatsApp copy/share, payment or no-show tracking. Those are later
slices in the 🔴/🟠 order set by CLAUDE.md §6.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | `phone` moves to a 1:1 `profiles_private` table | RLS is row-level; a member-visible roster plus `profiles_select_authenticated using (true)` exposes every phone number community-wide. Column separation is the only fix. |
| D2 | Phone is optional, edited in profile settings | Keeps signup to email + password + name. Rosters tolerate blanks. |
| D3 | Email + password now, Google OAuth wired but disabled | Password + local Inbucket is fully testable today with no external console. Google needs only env vars and one boolean later. |
| D4 | Email confirmation required for password signups | Closes the identity-linking takeover path (see §4.1). |
| D5 | Roles are set by seed (dev) and a service-role script (production) | `guard_profile_role_change` already blocks self-promotion by design. Admin promotion UI is a later slice. |
| D6 | JB004 split into JB004/JB007; not-found becomes JB008 | 401 and 403 require opposite handling and a Server Action cannot currently tell them apart. |
| D7 | Public routes use a cookie-free anon Supabase client and ISR | Touching `cookies()` forces a route dynamic, which would forfeit the `(marketing)` caching split in CLAUDE.md §2. |
| D8 | No Realtime in this slice | Registration is ordinary CRUD. Realtime is reserved for check-in, court status, and live waitlist counts. |
| D9 | Vitest on pure units only (zod schemas, error mapper) | The DB is heavily tested; this covers the two app-layer places where a silent mistake is likeliest and cheapest to catch. |

## 3. Migration `0014_profiles_private`

```sql
create table public.profiles_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `set_updated_at` trigger, matching every other table.
- Backfill `insert into profiles_private (user_id, phone) select id, phone from profiles where phone is not null`.
- `alter table public.profiles drop column phone;`
- `handle_new_user` gains a second `insert ... on conflict do nothing` so the 1:1 row always
  exists. The profile form then does a plain `update`, never an upsert.

### Grants

```sql
alter table public.profiles_private enable row level security;
revoke all on public.profiles_private from anon, authenticated;
grant select, update on public.profiles_private to authenticated;
```

No INSERT grant — the SECURITY DEFINER trigger owns row creation. No DELETE grant — the
cascade from `profiles` owns removal. `anon` gets nothing.

### Policies

`profiles_private_select_self_admin_or_host` (SELECT, authenticated):

```sql
using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.participants p
    where p.user_id = profiles_private.user_id
      and p.status <> 'cancelled'
      and public.is_session_host(p.session_id)
  )
)
```

`profiles_private_update_self` (UPDATE, authenticated): `user_id = auth.uid()` in both
`using` and `with check`.

The `exists` clause is served by the existing `participants_user_idx`.

Scope notes, both intentional:

- A cancelled participant drops out of host visibility immediately.
- A host who ran one session retains access to that player's phone indefinitely, including
  after the session completes. Hosts need to reach no-shows after the fact.

### Tests — `supabase/tests/013_profiles_private.test.sql`

At minimum:

1. table exists, RLS enabled
2. `profiles.phone` no longer exists
3. self can select own phone
4. self can update own phone
5. another member cannot select it (0 rows, not an error)
6. a host of a session where the user is a `confirmed` participant can select it
7. a host of a session where the user is `waiting_list` can select it
8. a host of a session where the user is `cancelled` cannot
9. a host of an unrelated session cannot
10. an admin can select it
11. `authenticated` has no INSERT or DELETE grant
12. `anon` has no grant at all
13. creating an auth user creates the `profiles_private` row

## 4. Migration `0015_error_codes`

Recreates five raise sites via `create or replace function`:

| Function | Condition | Was | Becomes |
|---|---|---|---|
| `register_for_session` | session not found | JB001 | JB008 |
| `host_add_participant` | not authorized | JB004 | JB007 |
| `host_set_participant_status` | not authorized | JB004 | JB007 |
| `host_set_participant_status` | participant not found | JB003 | JB008 |
| `guard_profile_role_change` | non-admin role change | JB004 | JB007 |

After this, the contract is:

| Code | Meaning | App response |
|---|---|---|
| JB001 | registration is not open | show the closed state |
| JB002 | session is full | show full / waitlist-full |
| JB003 | already registered, or nothing to cancel | "your registration changed, reload" |
| JB004 | not authenticated | redirect to `/login?next=` |
| JB005 | invalid match player | not reachable in this slice |
| JB006 | wrong transaction isolation | programming error: log, show generic failure |
| JB007 | not authorized | forbidden message |
| JB008 | session or participant not found | 404 |

JB003 stays overloaded between already-registered and nothing-to-cancel: both resolve to the
same user-facing message, so splitting them buys copy, not behaviour.

Assertions in `002`, `010`, and `012` that pin the old codes are updated in the same commit.

### Verification gate for §3–§4

`npx supabase db reset` → full pgTAP suite green (158 existing + new) →
`npx supabase gen types typescript --local > types/supabase.ts` →
`scripts/test-concurrent-registration.sh` re-run and still proving race-safety. The race
script is the only artefact that proves the property the schema exists for; a green pgTAP run
is not a substitute.

## 5. Auth layer

### 5.1 Identity linking

Supabase links a password identity and a Google identity that share a verified email address.
If password signups were allowed without confirmation, the ordering would be an account
takeover path: an attacker registers a password account on an address they do not control,
the real owner later signs in with Google, and the attacker's password now opens the owner's
account. Requiring email confirmation for password signups closes it. Locally this needs no
external service — `supabase start` already runs Inbucket. Resend is needed only before real
users exist.

### 5.2 Supabase config

`supabase/config.toml`:

- `[auth.email] enable_confirmations = true`
- `[auth.external.google]` present with `enabled = false`, reading `GOOGLE_CLIENT_ID` /
  `GOOGLE_SECRET` env vars that do not exist yet.

Going live with Google is two env vars and one boolean. No code change.

### 5.3 Three Supabase factories

| File | Cookies | Permitted use |
|---|---|---|
| `lib/supabase/server.ts` (exists) | yes | Server Components, Server Actions, route handlers |
| `lib/supabase/public.ts` (new) | **no** | ISR-cached public routes only |
| `lib/supabase/client.ts` (exists) | browser | client islands only |

`public.ts` builds an anon-key client with no cookie adapter, so `cookies()` is never
touched and the calling route stays statically cached. Each file carries a header comment
stating its rule. Public routes must never import `server.ts`.

### 5.4 Routes

```
app/(auth)/login/page.tsx
app/(auth)/signup/page.tsx
app/(auth)/actions.ts          signIn, signUp, signOut, signInWithGoogle
app/auth/confirm/route.ts      email links: verifyOtp({ token_hash, type })
app/auth/callback/route.ts     OAuth PKCE: exchangeCodeForSession(code)
app/auth/error/page.tsx
```

Two handlers rather than one: Supabase email links carry `token_hash` and OAuth carries
`code`, and they take different calls. Both honour `?next=` and redirect there.

### 5.5 Proxy

`proxy.ts` keeps calling `updateSession`, then adds an optimistic check: no session cookie
and the path is under the `(app)` group → redirect to `/login?next=<path>`. Cookie read only,
no database call — Next's own guidance, since proxy runs on every request including
prefetches.

This is UX. Every `(app)` page independently checks via its DAL function, and RLS is what
actually enforces access. Removing the proxy check must change nothing about what data is
reachable.

## 6. Route surface and data flow

```
(marketing)  /sessions              revalidate 60, public client, status='scheduled' and future
             /sessions/[id]         revalidate 60, generateMetadata for OG / WhatsApp previews
(auth)       /login /signup
(app)        layout.tsx             requireUser() gate, nav, sign out
             /dashboard             my upcoming registrations, status, waitlist position
             /profile               full_name, phone, avatar_url
             /sessions/new          host: create session
             /sessions/[id]/manage  host: roster + status overrides
```

### 6.1 The cached-page / per-user problem

`/sessions/[id]` is ISR-cached, so the server cannot know who is viewing. The register panel
is a client island needing the viewer's own registration status. It calls a route handler
`GET /api/sessions/[id]/my-registration`, which uses the session client and the DAL.

The alternative — querying Supabase directly from the island — costs the same number of
user-visible round trips but puts a query outside the DAL and bends the rule that client-side
Supabase is for realtime only. One extra file is the cheaper price.

### 6.2 Capacity, not live counts

The cached public page shows `max_participants`, not spots remaining. A live count would
force `revalidatePath` on the public page for every registration, which during a rush
invalidates the cache continuously and turns ISR into SSR with extra steps. Live counts are
realtime-slice work. `registerAction` therefore revalidates `/dashboard` only.

### 6.3 Registration flow

1. Island calls the `registerAction(sessionId)` Server Action.
2. Action uses the session client: `supabase.rpc('register_for_session', { p_session_id })`.
3. On error, `mapRpcError` reads `PostgrestError.code` — never the message — and returns a
   typed result.
4. On success, `revalidatePath('/dashboard')` and return `{ ok: true, status,
   waitlist_position }` so the island renders "Confirmed" or "Waitlist #3" without refetching.

`cancelAction` is the same shape against `cancel_registration`.

**No `.insert()` into `participants` anywhere, client or server.** The RPCs are the sole
write path; that is what makes the advisory lock airtight.

### 6.4 Host roster

`/sessions/[id]/manage` lists confirmed and waitlisted participants in registration order and
exposes promote / set-waiting / cancel buttons calling `host_set_participant_status`.

The overrides ship in this slice rather than the next because CLAUDE.md rule 3 requires every
automated flow to have a host-facing manual counterpart, and the promotion trigger is already
live in the database.

`host_add_participant` needs a member picker and waits for a later slice.

## 7. Shared modules

```
lib/validation/auth.ts       email, password (min 8)
lib/validation/session.ts    full shape; refine(ends_at > starts_at) mirrors the CHECK
lib/validation/profile.ts    full_name, phone, avatar_url
lib/errors/rpc.ts            JB001–JB008 → typed codes, off error.code only
lib/actions/result.ts        ActionResult<T> = { ok: true; data: T } | { ok: false; code; message; field? }
lib/dal/user.ts              getCurrentUser, requireUser, requireHost
lib/dal/sessions.ts          listUpcoming, getById, listMyHostedSessions
lib/dal/participants.ts      getMyRegistration, listRoster
lib/dal/profile.ts           getMyProfile (joins profiles_private)
```

Every `lib/dal/*` file starts with `import 'server-only'` and performs its own auth check at
the data source, per Next's Data Access Layer guidance.

Each zod schema is imported by the client `zodResolver` and re-parsed at the top of the
matching Server Action — one schema, both sides.

Server Actions return `ActionResult` rather than throwing, so forms render field errors
instead of tripping an error boundary.

## 8. Testing

- **Vitest**, pure units only: every zod schema (valid, invalid, boundary) and `mapRpcError`
  across all eight codes plus the null and unknown-code cases.
- **pgTAP** covers `0014` and `0015` as specified in §3 and §4.
- **`scripts/test-concurrent-registration.sh`** re-run after the migrations.
- No Playwright in this slice. Signup → confirm → login → register is verified by hand
  against local Supabase and Inbucket.

Known gap, stated rather than hidden: nothing automated proves a page renders or that the
end-to-end flow works. E2E is its own task.

## 9. Follow-ups this slice does not close

Carried forward from `core-schema-follow-ups.md`, still open:

- `sessions.created_by` is `ON DELETE RESTRICT`, so deleting a profile that ever created a
  session raises a bare FK error.
- Deleting a court under an `in_progress` match nulls `court_id` and leaves the match live.
- `participants_update_host` is column-unrestricted: a host can rewrite `registered_at` or
  `added_by`. Reachable from the roster UI's underlying grant, though this slice's UI only
  calls the RPC.
- Grant-surface tests cover the positive half only.
- `ARRIVAL_SPREAD_THRESHOLD_MS=50` is machine-tuned; make it an env override before CI.
- A demoted participant keeps their original `registered_at`.
- No mutation-style pass has been run over the policies and triggers.

New, opened by this slice:

- Resend and React Email are unconfigured, so email confirmation works locally via Inbucket
  but not in any deployed environment. Must be wired before the first real user.
- Google OAuth ships disabled and untested end to end.
- Password reset has no flow yet.
