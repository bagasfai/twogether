# Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email members about registration receipts, waitlist promotion, session cancellation or change, and a day-before reminder, through one database-written outbox.

**Architecture:** Postgres triggers on `participants` and `sessions` insert rows into `email_outbox` in the same transaction as the change. Server actions drain the outbox through `after()`; a daily Vercel cron route queues reminders and drains again as the retry sweep. The existing bump email moves onto the same outbox and `bump_notifications` is dropped.

**Tech Stack:** Next.js 16.3.4 (App Router, `after` from `next/server`), Supabase Postgres (plpgsql, pgTAP), Resend 6.x, React Email, Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-11-16-email-notifications-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` and the route handler doc before writing Next.js code (`AGENTS.md`).
- `email_outbox`: RLS enabled, no policies, all privileges revoked from `anon` and `authenticated`. Only the service role and `security definer` functions touch it.
- Every new plpgsql function: `security definer`, `set search_path = public, pg_temp`, and `revoke execute ... from public, anon, authenticated` (trigger functions and service-only RPCs alike). Service-only RPCs additionally `grant execute ... to service_role`.
- Recipient address is never stored; read it with `auth.admin.getUserById` at send time.
- Email copy is Indonesian. Dates format with `Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" })`.
- Email never changes an action's result and never delays its response. The drain never throws.
- Guests (`participants.user_id is null`) get no email.
- Retry limit `attempts < 3`. Stale-claim window 10 minutes. Cron schedule `0 11 * * *` UTC.
- No new npm dependency. Cron config goes in `vercel.json`, not `vercel.ts`.
- After every migration: `npx supabase gen types typescript --local > types/supabase.ts`.
- The working tree holds unrelated uncommitted password-reset work (`proxy.ts`, `tests/unit/proxy-is-protected.test.ts`, `lib/actions/auth.ts`, and others). Do not edit or stage those files. Stage by explicit path only; never `git add -A` or `git add .`.
- Verification commands: `npx supabase test db` (local stack must be running), `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`.

## Review Focus

1. **Session cancelled while receipts are still queued.** A member must not get "pendaftaran terkonfirmasi" for a session that was cancelled a second later. The drain closes every non-`session_cancelled` row as stale when the session is `cancelled`. Test in Task 5. (Extends the spec's stale guard, which only covered ended sessions.)
2. **Email configuration missing** (`RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, or site URL unset, as on the current Vercel project). The drain must return before claiming, so rows do not burn their 3 attempts. Test in Task 5.
3. **One bad recipient in a batch** (account without an address). The other rows in the batch still send. Test in Task 5.
4. **Session edit that touches none of time or venue** (title, description, capacity). No `session_changed` email. Test in Task 3.
5. **Host hard-deletes a confirmed participant row.** No email for the deleted row and no error; the member promoted by `participants_promote_waitlist_on_delete` still gets `waitlist_promoted`. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261116000001_email_outbox.sql` | Enum, table, `profiles.email_reminders`, `claim_email_outbox` |
| `supabase/migrations/20261116000002_email_participant_trigger.sql` | `queue_participant_email`, `register_for_session` without the bump insert, bump row copy, drop `bump_notifications` |
| `supabase/migrations/20261116000003_email_session_trigger.sql` | `queue_session_email`, `queue_session_reminders` |
| `supabase/tests/045_email_outbox.test.sql`, `046_email_participant_trigger.test.sql`, `047_email_session_trigger.test.sql` | pgTAP |
| `lib/email/templates/layout.tsx` | Shared shell and session summary block |
| `lib/email/templates/*.tsx` | One component per `email_type` |
| `lib/email/templates/registry.ts` | `email_type` → subject + component |
| `lib/email/drain-outbox.ts` | Claim, render, send, close or release |
| `lib/email/schedule-drain.ts` | `after()` wrapper used by server actions |
| `app/api/cron/email/route.ts` | Daily reminder queue + drain |
| `vercel.json` | Cron declaration |

Deleted: `lib/email/send-bump-notifications.ts`, `lib/email/bump-email.tsx`, `tests/unit/send-bump-notifications.test.ts`.

---

### Task 1: Outbox schema and claim RPC

**Files:**
- Create: `supabase/migrations/20261116000001_email_outbox.sql`
- Test: `supabase/tests/045_email_outbox.test.sql`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Produces:
  - enum `public.email_type`: `registration_confirmed`, `registration_waitlisted`, `registration_cancelled`, `waitlist_promoted`, `bumped`, `session_cancelled`, `session_changed`, `session_reminder`
  - table `public.email_outbox (id uuid pk default gen_random_uuid(), type email_type not null, user_id uuid not null references profiles(id) on delete cascade, session_id uuid not null references sessions(id) on delete cascade, payload jsonb not null default '{}', dedupe_key text unique, created_at timestamptz not null default now(), claimed_at timestamptz, sent_at timestamptz, attempts int not null default 0, last_error text)`
  - index `email_outbox_pending_idx on (created_at) where sent_at is null`
  - column `public.profiles.email_reminders boolean not null default true`
  - `public.claim_email_outbox(p_limit int) returns setof public.email_outbox`

- [ ] **Step 1: Write the failing test** `045_email_outbox.test.sql`, following the header and fixture style of `supabase/tests/044_adjust_session_capacity.test.sql` (UUID suffix `-0045-`). Assertions:

```sql
select has_table('public', 'email_outbox', 'email_outbox exists');
select has_column('public', 'profiles', 'email_reminders', 'profiles.email_reminders exists');
select col_default_is('public', 'profiles', 'email_reminders', 'true', 'reminders default on');
select ok(not has_table_privilege('anon', 'public.email_outbox', 'select'), 'anon lacks SELECT');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'select'), 'authenticated lacks SELECT');
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'insert'), 'authenticated lacks INSERT');
select ok(not has_function_privilege('authenticated', 'public.claim_email_outbox(int)', 'execute'),
  'authenticated cannot claim');
select ok(has_function_privilege('service_role', 'public.claim_email_outbox(int)', 'execute'),
  'service_role can claim');
```

Then insert five rows directly (as the test's superuser) for one user and one scheduled session: `pending`, `sent` (`sent_at = now()`), `exhausted` (`attempts = 3`), `fresh_claim` (`claimed_at = now() - interval '1 minute'`), `stale_claim` (`claimed_at = now() - interval '11 minutes'`, `attempts = 1`). Assert:

```sql
select set_eq(
  $$ select id from public.claim_email_outbox(10) $$,
  $$ values (:'pending'::uuid), (:'stale_claim'::uuid) $$,
  'claim returns pending and stale-claimed rows only');
select is((select attempts from public.email_outbox where id = :'pending'), 1, 'claim increments attempts');
select is((select attempts from public.email_outbox where id = :'stale_claim'), 2, 'reclaim increments attempts');
select isnt((select claimed_at from public.email_outbox where id = :'pending'), null, 'claim stamps claimed_at');
select is_empty($$ select id from public.claim_email_outbox(10) $$, 'second claim returns nothing');
```

psql does not expand `:'var'` inside `$$ ... $$`; write the fixture ids as literal UUIDs in the real file, as `044` does.

Add one more with two fresh pending rows and `claim_email_outbox(1)` returning exactly one row, the older by `created_at`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx supabase test db`
Expected: `045_email_outbox.test.sql` fails with `relation "public.email_outbox" does not exist`.

- [ ] **Step 3: Write the migration.** Table, enum, index, column, RLS and revokes per Interfaces and Global Constraints. `claim_email_outbox` is one statement:

```sql
update public.email_outbox o
   set claimed_at = now(), attempts = o.attempts + 1
 where o.id in (
   select id from public.email_outbox
    where sent_at is null
      and attempts < 3
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by created_at, id
    limit p_limit
    for update skip locked)
returning o.*;
```

- [ ] **Step 4: Apply and run**

Run: `npx supabase migration up && npx supabase test db`
Expected: `045` passes; all other files unchanged.

- [ ] **Step 5: Regenerate types and commit**

```bash
npx supabase gen types typescript --local > types/supabase.ts
git add supabase/migrations/20261116000001_email_outbox.sql supabase/tests/045_email_outbox.test.sql types/supabase.ts
git commit -m "feat(email): add email_outbox table and claim rpc"
```

---

### Task 2: Participant trigger, bump migration

**Files:**
- Create: `supabase/migrations/20261116000002_email_participant_trigger.sql`
- Test: `supabase/tests/046_email_participant_trigger.test.sql`
- Modify (assertions only, `bump_notifications` → `email_outbox`): `supabase/tests/031_premium_membership_schema.test.sql`, `033_premium_registration.test.sql`, `038_premium_grant_surface_negatives.test.sql`, `041_drilling_registration_rules.test.sql`, `044_adjust_session_capacity.test.sql`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Consumes: `public.email_outbox`, `public.email_type` (Task 1); `public.waitlist_position_of(uuid, timestamptz, uuid)` (existing, `20261023000003_premium_membership_helpers.sql:89`).
- Produces: trigger `participants_queue_email` on `public.participants`; `public.bump_notifications` no longer exists; `register_for_session` no longer writes a notification row itself.

- [ ] **Step 1: Write the failing test** `046_email_participant_trigger.test.sql`. Fixtures: one host, members, one guest row, sessions in `scheduled`, `live`, `draft`. Drive transitions through the real RPCs where one exists (`register_for_session`, `cancel_registration`, `host_add_participant`, `host_set_participant_status`, `transfer_participation`), using the `set local role authenticated` + `request.jwt.claims` pattern from `010_registration.test.sql`. Each case asserts the exact `(type, user_id)` set added to `email_outbox` for that session:

| Test name | Action | Expected new rows |
|---|---|---|
| `register_confirmed` | member registers, seats free | `registration_confirmed` for member |
| `register_waitlisted` | member registers, session full | `registration_waitlisted`, `payload->>'waitlist_position' = '1'` |
| `second_waitlister_position` | another member registers | `payload->>'waitlist_position' = '2'` |
| `cancel_promotes` | confirmed member cancels | `registration_cancelled` for canceller, `waitlist_promoted` for first waitlister |
| `reregister_after_cancel` | cancelled member registers again | `registration_confirmed` or `registration_waitlisted` per capacity |
| `host_promotes` | `host_set_participant_status(..., 'confirmed')` on a waitlister | `waitlist_promoted` |
| `host_demotes` | host sets confirmed → `waiting_list` | `registration_waitlisted` |
| `premium_bump` | premium registers on a full session | `bumped` for the bumped member and no `registration_waitlisted` for them |
| `guest_bump_no_email` | bump target is a guest row | no row for the guest |
| `guest_register_no_email` | `register_guest_for_session` | no row |
| `draft_session_no_email` | host adds participant to a draft session | no row |
| `live_session_emails` | cancel on a live session | `registration_cancelled` |
| `transfer_emails_both` | `transfer_participation` | `registration_cancelled` for giver, `registration_confirmed` for receiver |
| `hard_delete_no_email_but_promotes` | superuser `delete` of a confirmed row with a waitlister present | no row for deleted user; `waitlist_promoted` for the waitlister |

Final assertions: `hasnt_table('public', 'bump_notifications', ...)`, and `ok(not has_function_privilege('authenticated', 'public.queue_participant_email()', 'execute'), ...)`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx supabase test db`
Expected: `046` fails (no rows in `email_outbox`; `bump_notifications` still exists).

- [ ] **Step 3: Write the migration**, in this order:

1. Trigger function. The whole decision is this body:

```sql
create or replace function public.queue_participant_email()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_type public.email_type;
  v_payload jsonb := '{}';
begin
  if new.user_id is null then return null; end if;
  if not exists (select 1 from public.sessions
                  where id = new.session_id and status in ('scheduled', 'live')) then
    return null;
  end if;

  if tg_op = 'INSERT' or old.status = 'cancelled' then
    v_type := case new.status
      when 'confirmed' then 'registration_confirmed'
      when 'waiting_list' then 'registration_waitlisted' end;
  elsif old.status = 'waiting_list' and new.status = 'confirmed' then
    v_type := 'waitlist_promoted';
  elsif old.status = 'confirmed' and new.status = 'waiting_list' then
    v_type := case when new.bumped_at is distinct from old.bumped_at
      then 'bumped' else 'registration_waitlisted' end;
  elsif new.status = 'cancelled' then
    v_type := 'registration_cancelled';
  end if;

  if v_type is null then return null; end if;

  if v_type = 'registration_waitlisted' then
    v_payload := jsonb_build_object('waitlist_position',
      public.waitlist_position_of(new.session_id, new.registered_at, new.id));
  end if;

  insert into public.email_outbox (type, user_id, session_id, payload)
  values (v_type, new.user_id, new.session_id, v_payload);
  return null;
end; $$;
```

2. Two triggers sharing that function: `participants_queue_email_insert` (`after insert ... for each row`) and `participants_queue_email` (`after update of status ... for each row when (old.status is distinct from new.status)`).
3. `create or replace function public.register_for_session(p_session_id uuid)`: copy the current body verbatim from `supabase/migrations/20261028000002_drilling_registration_rules.sql` (starts line 27) and delete only the `if v_bump_target_user is not null then insert into public.bump_notifications ... end if;` block (lines ~174-178). Re-issue the same `revoke`/`grant` lines that migration issues for this function.
4. Copy unsent bump rows, then drop:

```sql
insert into public.email_outbox (type, user_id, session_id, created_at)
select 'bumped', p.user_id, p.session_id, b.created_at
  from public.bump_notifications b
  join public.participants p on p.id = b.participant_id
 where b.sent_at is null and p.user_id is not null;

drop table public.bump_notifications;
```

- [ ] **Step 4: Update the five existing test files.** Replace each `bump_notifications` assertion with its `email_outbox` equivalent filtered by `type = 'bumped'` (join on `user_id`/`session_id` instead of `participant_id`). In `031` and `038`, replace table-existence and privilege checks with `hasnt_table('public', 'bump_notifications', ...)`; privilege coverage for the new table already lives in `045`. Keep each file's `plan(n)` in step with the assertion count.

- [ ] **Step 5: Apply and run**

Run: `npx supabase migration up && npx supabase test db`
Expected: all files pass, including `010`, `033`, `041`, `043`, `044`.

- [ ] **Step 6: Regenerate types and commit**

```bash
npx supabase gen types typescript --local > types/supabase.ts
git add supabase/migrations/20261116000002_email_participant_trigger.sql supabase/tests/046_email_participant_trigger.test.sql supabase/tests/031_premium_membership_schema.test.sql supabase/tests/033_premium_registration.test.sql supabase/tests/038_premium_grant_surface_negatives.test.sql supabase/tests/041_drilling_registration_rules.test.sql supabase/tests/044_adjust_session_capacity.test.sql types/supabase.ts
git commit -m "feat(email): queue participant emails by trigger, drop bump_notifications"
```

`npx tsc --noEmit` and `tests/unit/send-bump-notifications.test.ts` fail from this commit until Task 5 removes `send-bump-notifications.ts`. That is expected; do not patch it here. Tasks 3 and 4 verify with their own targeted commands only.

---

### Task 3: Session trigger and reminder queue

**Files:**
- Create: `supabase/migrations/20261116000003_email_session_trigger.sql`
- Test: `supabase/tests/047_email_session_trigger.test.sql`
- Modify: `types/supabase.ts` (regenerated)

**Interfaces:**
- Consumes: `public.email_outbox`, `profiles.email_reminders` (Task 1).
- Produces:
  - trigger `sessions_queue_email` on `public.sessions`
  - `public.queue_session_reminders() returns int` — number of rows inserted; service role only.

- [ ] **Step 1: Write the failing test** `047_email_session_trigger.test.sql`. Fixture session S1 `scheduled` with two confirmed members, one waitlisted member, one cancelled member, one guest row.

| Test name | Action | Expected |
|---|---|---|
| `cancel_notifies_active` | `update sessions set status = 'cancelled'` on S1 | 3 `session_cancelled` rows: the two confirmed and the waitlisted member. None for the cancelled member or guest |
| `change_time_notifies` | change `starts_at` and `ends_at` on a scheduled session | one `session_changed` per active member; `payload` has `old_starts_at`, `old_ends_at`, `old_location` equal to the pre-update values |
| `change_location_notifies` | change `location` only | `session_changed`, `payload->>'old_location'` = old value |
| `title_only_no_email` | change `title`, `description`, `max_participants` | no rows |
| `draft_change_no_email` | change `starts_at` on a draft session | no rows |
| `draft_cancel_no_email` | cancel a draft session | no rows |
| `live_cancel_notifies` | cancel a live session | `session_cancelled` rows |
| `publish_no_email` | `draft` → `scheduled` | no rows |

Reminder cases. Build "tomorrow in Jakarta" explicitly so the test passes at any hour:

```sql
\set tomorrow_10 '((date_trunc(''day'', now() at time zone ''Asia/Jakarta'') + interval ''1 day 10 hours'') at time zone ''Asia/Jakarta'')'
```

Sessions: R1 scheduled at `tomorrow_10`; R2 scheduled today + 1 hour; R3 scheduled at `tomorrow_10 + interval '1 day'`; R4 `draft` at `tomorrow_10`. Members on R1: confirmed A, confirmed B with `email_reminders = false`, waitlisted C, guest row.

```sql
select is(public.queue_session_reminders(), 1, 'one reminder queued');
select is((select user_id from public.email_outbox where type = 'session_reminder'), :'A'::uuid, 'only confirmed opted-in member');
select is((select dedupe_key from public.email_outbox where type = 'session_reminder'),
  'reminder:' || :'R1' || ':' || :'A', 'dedupe key shape');
select is(public.queue_session_reminders(), 0, 'second run queues nothing');
select ok(not has_function_privilege('authenticated', 'public.queue_session_reminders()', 'execute'), 'members cannot queue reminders');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx supabase test db`
Expected: `047` fails with `function public.queue_session_reminders() does not exist`.

- [ ] **Step 3: Write the migration.**

- `queue_session_email()` trigger function, fired by `sessions_queue_email` `after update on public.sessions for each row`. Recipients for both branches: `participants` of `new.id` with `user_id is not null` and `status in ('confirmed', 'waiting_list')`.
  - Branch 1: `old.status in ('scheduled', 'live') and new.status = 'cancelled'` → type `session_cancelled`, empty payload.
  - Branch 2: `old.status = 'scheduled' and new.status = 'scheduled'` and any of `starts_at`, `ends_at`, `location` `is distinct from` its old value → type `session_changed`, payload `jsonb_build_object('old_starts_at', old.starts_at, 'old_ends_at', old.ends_at, 'old_location', old.location)`.
- `queue_session_reminders()`: one `insert ... select ... on conflict (dedupe_key) do nothing`, with `get diagnostics v_count = row_count; return v_count;`. Filter:

```sql
where s.status = 'scheduled'
  and (s.starts_at at time zone 'Asia/Jakarta')::date
      = (now() at time zone 'Asia/Jakarta')::date + 1
  and p.status = 'confirmed'
  and p.user_id is not null
  and pr.email_reminders
```

`dedupe_key = 'reminder:' || s.id || ':' || p.user_id`.

- [ ] **Step 4: Apply and run**

Run: `npx supabase migration up && npx supabase test db`
Expected: all pass.

- [ ] **Step 5: Regenerate types and commit**

```bash
npx supabase gen types typescript --local > types/supabase.ts
git add supabase/migrations/20261116000003_email_session_trigger.sql supabase/tests/047_email_session_trigger.test.sql types/supabase.ts
git commit -m "feat(email): queue session cancel/change emails and reminders"
```

---

### Task 4: Templates and registry

**Files:**
- Create: `lib/email/templates/layout.tsx`, `registration-confirmed.tsx`, `registration-waitlisted.tsx`, `registration-cancelled.tsx`, `waitlist-promoted.tsx`, `bumped.tsx`, `session-cancelled.tsx`, `session-changed.tsx`, `session-reminder.tsx`, `registry.ts` (all under `lib/email/templates/`)
- Test: `tests/unit/email-templates.test.ts`

**Interfaces:**
- Produces, from `lib/email/templates/registry.ts`:

```ts
export type EmailType = Database["public"]["Enums"]["email_type"];

export type EmailContext = {
  name: string | null;
  sessionTitle: string;
  startsAt: string;      // ISO
  endsAt: string;        // ISO
  location: string;
  sessionUrl: string;    // `${siteUrl}/sessions/${id}`
  profileUrl: string;    // `${siteUrl}/profile`
  payload: Record<string, unknown>;
};

export const EMAIL_TEMPLATES: Record<EmailType, {
  subject: (ctx: EmailContext) => string;
  Component: (props: { ctx: EmailContext }) => React.ReactElement;
}>;
```

- From `layout.tsx`: `EmailLayout({ preview, heading, name, children, ctx, cta? })` rendering `<Html lang="id">`, greeting `Halo{name ? \` ${name}\` : ""},`, a session summary block (title, formatted start, location), and a "Lihat sesi" button to `ctx.sessionUrl`. Reuse the inline styles from the current `bump-email.tsx`.

Subjects, exact:

| Type | Subject |
|---|---|
| `registration_confirmed` | `Pendaftaran kamu terkonfirmasi: ${sessionTitle}` |
| `registration_waitlisted` | `Kamu masuk daftar tunggu: ${sessionTitle}` |
| `registration_cancelled` | `Pendaftaran kamu dibatalkan: ${sessionTitle}` |
| `waitlist_promoted` | `Kamu dapat slot di ${sessionTitle}` |
| `bumped` | `Kamu dipindah ke daftar tunggu` |
| `session_cancelled` | `Sesi dibatalkan: ${sessionTitle}` |
| `session_changed` | `Perubahan jadwal sesi: ${sessionTitle}` |
| `session_reminder` | `Pengingat: ${sessionTitle} besok` |

Body requirements beyond the layout:
- `registration_waitlisted`: shows `Urutan daftar tunggu: ${payload.waitlist_position}` when the payload has a number; omits the line otherwise.
- `bumped`: the two body paragraphs from `bump-email.tsx`, unchanged.
- `session_changed`: a "Sebelumnya" block (formatted `payload.old_starts_at`, `payload.old_location`) and a "Sekarang" block (formatted `startsAt`, `location`).
- `session_cancelled` and `registration_cancelled`: no "Lihat sesi" button for `session_cancelled` (the public page hides cancelled sessions).
- `session_reminder`: last line `Tidak ingin menerima pengingat? Matikan di halaman profil.` linking to `ctx.profileUrl`.

- [ ] **Step 1: Write the failing test** `tests/unit/email-templates.test.ts`:

```ts
const ctx: EmailContext = {
  name: "Budi", sessionTitle: "Sabtu Pagi", startsAt: "2026-11-21T01:00:00Z",
  endsAt: "2026-11-21T03:00:00Z", location: "GOR Grogol",
  sessionUrl: "https://x.test/sessions/s1", profileUrl: "https://x.test/profile",
  payload: { waitlist_position: 2, old_starts_at: "2026-11-20T01:00:00Z",
             old_ends_at: "2026-11-20T03:00:00Z", old_location: "GOR Lama" },
};

it.each(Object.keys(EMAIL_TEMPLATES))("%s renders with title and greeting", async (type) => {
  const t = EMAIL_TEMPLATES[type as EmailType];
  const html = await render(createElement(t.Component, { ctx }));
  expect(html).toContain("Sabtu Pagi");
  expect(html).toContain("Halo Budi");
  expect(t.subject(ctx).length).toBeGreaterThan(0);
});
it("registry covers all 8 types", () => expect(Object.keys(EMAIL_TEMPLATES)).toHaveLength(8));
it("waitlisted shows the position", /* html contains "Urutan daftar tunggu: 2" */);
it("waitlisted omits the position when payload is empty", /* payload: {} → no "Urutan daftar tunggu" */);
it("session_changed shows old and new venue", /* contains "GOR Lama" and "GOR Grogol" */);
it("session_cancelled has no session link", /* html does not contain ctx.sessionUrl */);
it("session_reminder links to the profile page", /* contains ctx.profileUrl */);
it("renders without a name", /* name: null → contains "Halo," */);
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/unit/email-templates.test.ts`
Expected: FAIL, cannot resolve `@/lib/email/templates/registry`.

- [ ] **Step 3: Implement** layout, eight components, registry. `bumped.tsx` copies its two body paragraphs from `lib/email/bump-email.tsx`; that file stays until Task 5 removes its last importer.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/unit/email-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates tests/unit/email-templates.test.ts
git commit -m "feat(email): add notification templates and registry"
```

---

### Task 5: Outbox drain

**Files:**
- Create: `lib/email/drain-outbox.ts`
- Delete: `lib/email/send-bump-notifications.ts`, `lib/email/bump-email.tsx`, `tests/unit/send-bump-notifications.test.ts`
- Modify: `lib/actions/registration.ts` (remove the `sendPendingBumpNotifications` import and its `try` block only; Task 6 adds the replacement), `lib/supabase/service.ts` (comment mentions `bump_notifications`; change the example to `email_outbox`)
- Test: `tests/unit/drain-outbox.test.ts`

**Interfaces:**
- Consumes: `claim_email_outbox` (Task 1), `EMAIL_TEMPLATES`, `EmailContext` (Task 4), `getSiteUrl` from `@/lib/seo/urls`, `createServiceClient` from `@/lib/supabase/service` (lazy `import()`, as `send-bump-notifications.ts` does today).
- Produces:

```ts
export type DrainResult = { sent: number; failed: number; skipped: number };

export async function drainEmailOutbox(deps?: {
  resend?: Pick<Resend, "emails">;
  supabase?: SupabaseClient<Database>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<DrainResult>;
```

Behaviour, in order:
1. If `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, or `getSiteUrl()` is missing: log once, return zeros, **claim nothing**. (With `deps.resend` injected, the API key check is skipped.)
2. Loop at most 4 batches: `supabase.rpc("claim_email_outbox", { p_limit: 50 })`. Stop when a batch returns fewer than 50 rows.
3. Per row: load `sessions (id, title, starts_at, ends_at, location, status)`, `profiles.full_name`, and the address via `auth.admin.getUserById(row.user_id)`.
4. Skip (set `sent_at = now`, `last_error = 'stale'`, count `skipped`) when `ends_at` is in the past, or when `session.status === 'cancelled'` and `row.type !== 'session_cancelled'`.
5. Render `EMAIL_TEMPLATES[row.type]` and call `resend.emails.send({ from, to: [email], subject, html }, { idempotencyKey: row.id })`. `from` is `Jakbar Twogether <no-reply@${RESEND_EMAIL_DOMAIN}>`.
6. Success: `sent_at = now`. Any failure in steps 3-5: `claimed_at = null`, `last_error = <message>`, count `failed`, continue with the next row.
7. `await sleep(600)` between sends (default `sleep` is a real timer; at most 2 requests per second).
8. The outer body is wrapped so the function never throws.

- [ ] **Step 1: Write the failing test** `tests/unit/drain-outbox.test.ts`. Build one in-memory fake Supabase (tables `email_outbox`, `sessions`, `profiles`; `rpc("claim_email_outbox")` returning unclaimed rows once; `auth.admin.getUserById`) and a fake `resend.emails.send` spy, in the style of the deleted `send-bump-notifications.test.ts`. Inject `sleep: async () => {}`. Set `RESEND_EMAIL_DOMAIN` and `NEXT_PUBLIC_SITE_URL` in `beforeEach` with `vi.stubEnv`.

```ts
it("sends a claimed row and closes it", /* result {sent:1,failed:0,skipped:0}; row.sent_at set;
  send called with to:["a@test.local"], subject "Pendaftaran kamu terkonfirmasi: Sabtu Pagi",
  second arg { idempotencyKey: row.id } */);
it("releases the claim and stores the error when Resend fails", /* send → {error:{message:"boom"}};
  row.claimed_at === null, row.last_error === "boom", row.sent_at === null; failed 1 */);
it("continues past a recipient with no address", /* row1 user has no email, row2 fine → sent 1, failed 1 */);
it("closes rows for an ended session as stale without sending", /* ends_at in the past → skipped 1,
  last_error "stale", send not called */);
it("closes a receipt as stale when the session is cancelled", /* type registration_confirmed, status cancelled → skipped */);
it("still sends session_cancelled for a cancelled session", /* sent 1 */);
it("claims nothing when the email domain is unset", /* stubEnv RESEND_EMAIL_DOMAIN "" → rpc not called, zeros */);
it("never throws when the claim rpc errors", /* rpc → {error} → resolves to zeros */);
it("stops after a short batch", /* 3 rows → rpc called once */);
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/unit/drain-outbox.test.ts`
Expected: FAIL, cannot resolve `@/lib/email/drain-outbox`.

- [ ] **Step 3: Implement** `drainEmailOutbox`. Delete the three bump files and the bump call in `registration.ts`.

- [ ] **Step 4: Run the suite and typecheck**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: all pass; no reference to `bump_notifications` or `sendPendingBumpNotifications` remains (`grep -rn "bump_notifications\|sendPendingBump" lib app tests types` prints nothing).

- [ ] **Step 5: Commit**

```bash
git add lib/email/drain-outbox.ts tests/unit/drain-outbox.test.ts lib/actions/registration.ts lib/supabase/service.ts
git rm -q lib/email/send-bump-notifications.ts lib/email/bump-email.tsx tests/unit/send-bump-notifications.test.ts
git commit -m "feat(email): drain email_outbox with retry and stale guard"
```

---

### Task 6: Drain after server actions

**Files:**
- Create: `lib/email/schedule-drain.ts`
- Modify: `lib/actions/registration.ts`, `lib/actions/participants.ts`, `lib/actions/sessions.ts`, `lib/actions/transfers.ts`, `lib/actions/capacity.ts`
- Test: `tests/unit/schedule-drain.test.ts`

**Interfaces:**
- Consumes: `drainEmailOutbox` (Task 5).
- Produces: `export function scheduleEmailDrain(): void` — calls `after(async () => { await drainEmailOutbox(); })` from `next/server`, with the callback catching and logging anything.

Call `scheduleEmailDrain()` once on the success path, immediately before the `revalidatePath` calls, in exactly these functions:

| File | Functions |
|---|---|
| `registration.ts` | `registerForSession`, `cancelRegistration`, `registerGuestForSession`, `cancelGuestRegistration`, `confirmParticipation` |
| `participants.ts` | `setParticipantStatus`, `hostAddParticipant` |
| `sessions.ts` | `updateSession`, `cancelSession` |
| `transfers.ts` | `transferSeat` |
| `capacity.ts` | `adjustCoachCount` |

Guest actions are included because a guest cancellation can promote a member.

- [ ] **Step 1: Write the failing test** `tests/unit/schedule-drain.test.ts`:

```ts
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/email/drain-outbox", () => ({ drainEmailOutbox: vi.fn() }));

it("defers the drain with after()", /* scheduleEmailDrain(); after called once; drain not yet called;
  await after.mock.calls[0][0](); drain called once */);
it("swallows a drain rejection", /* drain rejects → awaiting the callback resolves */);

const CALL_SITES: Record<string, string[]> = { /* the table above */ };
it.each(Object.entries(CALL_SITES))("%s schedules a drain in each mutating action", (file, fns) => {
  const src = readFileSync(`lib/actions/${file}`, "utf8");
  for (const fn of fns) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`));
    const end = body.indexOf("\nexport ", 1);
    expect(body.slice(0, end === -1 ? undefined : end)).toContain("scheduleEmailDrain()");
  }
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/unit/schedule-drain.test.ts`
Expected: FAIL, cannot resolve `@/lib/email/schedule-drain`.

- [ ] **Step 3: Implement** the helper and add the eleven calls. In `registerForSession`, replace the comment block about bump notifications with one line stating that emails are queued by database triggers and drained after the response.

- [ ] **Step 4: Run**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/email/schedule-drain.ts tests/unit/schedule-drain.test.ts lib/actions/registration.ts lib/actions/participants.ts lib/actions/sessions.ts lib/actions/transfers.ts lib/actions/capacity.ts
git commit -m "feat(email): drain outbox after participant and session actions"
```

---

### Task 7: Cron route

**Files:**
- Create: `app/api/cron/email/route.ts`, `vercel.json`
- Modify: `.env.example` (add `CRON_SECRET=` with a one-line comment), `README.md` (env table row for `CRON_SECRET`; deploy step: set it on Vercel), `docs/superpowers/core-schema-follow-ups.md` — **this file has uncommitted edits: append one bullet under the existing Resend entry (line ~110) and leave it unstaged; say so in the task report.**
- Test: `tests/unit/cron-email-route.test.ts`

**Interfaces:**
- Consumes: `drainEmailOutbox` (Task 5), `queue_session_reminders()` (Task 3), `createServiceClient`.
- Produces: `export async function GET(request: Request): Promise<Response>`
  - `401` with body `{ "error": "unauthorized" }` when `CRON_SECRET` is unset or empty, or `Authorization` is not exactly `Bearer ${CRON_SECRET}`.
  - Otherwise `200` with `{ queued: number, sent: number, failed: number, skipped: number }`. A failing `queue_session_reminders` rpc is logged, reports `queued: 0`, and the drain still runs.
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/email", "schedule": "0 11 * * *" }] }`

- [ ] **Step 1: Write the failing test** `tests/unit/cron-email-route.test.ts` (mock `@/lib/email/drain-outbox` and `@/lib/supabase/service`):

```ts
it("rejects a missing header", /* status 401, drain not called */);
it("rejects a wrong secret", /* "Bearer nope" → 401 */);
it("rejects when CRON_SECRET is unset", /* stubEnv CRON_SECRET "" and header "Bearer " → 401;
  also header "Bearer undefined" → 401 */);
it("queues reminders then drains", /* rpc "queue_session_reminders" → {data:3};
  drain → {sent:2,failed:1,skipped:0}; body {queued:3,sent:2,failed:1,skipped:0};
  rpc called before drain */);
it("still drains when queueing fails", /* rpc → {error} → 200, queued 0, drain called */);
it("is outside the protected routes", () => expect(isProtected("/api/cron/email")).toBe(false));
it("declares the daily schedule", /* JSON.parse(readFileSync("vercel.json")).crons deep-equals
  [{ path: "/api/cron/email", schedule: "0 11 * * *" }] */);
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/unit/cron-email-route.test.ts`
Expected: FAIL, cannot resolve `@/app/api/cron/email/route`.

- [ ] **Step 3: Implement** the route and `vercel.json`. `proxy.ts` needs no change: `isProtected` already returns `false` for `/api/...`; the test pins that.

- [ ] **Step 4: Run**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/email/route.ts vercel.json tests/unit/cron-email-route.test.ts .env.example README.md
git commit -m "feat(email): add daily reminder and retry cron route"
```

---

### Task 8: Reminder opt-out on the profile page

**Files:**
- Modify: `lib/validation/profile.ts`, `lib/actions/profile.ts`, `components/profile/profile-form.tsx`, `app/(app)/profile/page.tsx` (and the DAL function it reads the profile from, to select `email_reminders`)
- Test: `tests/unit/validation.test.ts` (profile cases), `tests/unit/profile-email-reminders.test.ts`

**Interfaces:**
- Consumes: `profiles.email_reminders` (Task 1).
- Produces: `profileSchema` gains `emailReminders: z.boolean().optional()` — omitted means "leave the stored value alone", the same rule `gender` follows. `updateProfile` writes `email_reminders` in its existing `profiles` update only when the field is provided.

UI: one shadcn `Switch` in `profile-form.tsx`, label `Email pengingat sesi`, helper text `Dikirim sehari sebelum sesi yang kamu ikuti.`, default from the loaded profile. If `components/ui/switch.tsx` does not exist, add it with `npx shadcn@latest add switch` (a shadcn primitive, not a new dependency decision). The existing `profiles_update_self_or_admin` policy already limits the write to the owner; no migration.

- [ ] **Step 1: Write the failing tests.**

In `tests/unit/validation.test.ts`, beside the existing `profileSchema` cases:

```ts
it("accepts emailReminders false", /* parse({fullName:"Budi", phone: <valid as in neighbouring cases>, emailReminders:false}).emailReminders === false */);
it("leaves emailReminders undefined when omitted", /* parsed.emailReminders === undefined */);
it("rejects a non-boolean emailReminders", /* "yes" → safeParse fails */);
```

`tests/unit/profile-email-reminders.test.ts`, mocking `@/lib/supabase/server` and `@/lib/dal/user` the way `tests/unit/profile-avatar-actions.test.ts` does:

```ts
it("writes email_reminders when provided", /* updateProfile({..., emailReminders:false}) →
  profiles update payload equals { full_name: "Budi", email_reminders: false } */);
it("does not touch email_reminders when omitted", /* payload equals { full_name: "Budi" } */);
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run tests/unit/validation.test.ts tests/unit/profile-email-reminders.test.ts`
Expected: the five new cases FAIL.

- [ ] **Step 3: Implement** schema, action, form switch, and page data.

- [ ] **Step 4: Run everything**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint && npx supabase test db`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/profile.ts lib/actions/profile.ts components/profile/profile-form.tsx "app/(app)/profile/page.tsx" tests/unit/validation.test.ts tests/unit/profile-email-reminders.test.ts
git commit -m "feat(profile): add session reminder email opt-out"
```

Add `components/ui/switch.tsx` and the DAL file to the `git add` if they changed.

---

## Manual check after Task 8 (local, not automated)

Application email goes straight to Resend, not through the local mail catcher. With the local stack and `next dev` running, register a member for a scheduled session, then:

- With a real `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN` in `.env.local`: the receipt arrives, and `select type, sent_at from email_outbox` shows `sent_at` set.
- Without them: the row stays queued with `attempts = 0`, because the drain's configuration guard returns before claiming.

## Deploy notes (not part of this plan's tasks)

- Push the three migrations to the hosted project (it is already behind; see `docs/superpowers/core-schema-follow-ups.md`).
- Set `CRON_SECRET` on Vercel. Vercel sends it as `Authorization: Bearer` on cron invocations.
- `profiles.email_reminders` is readable by any signed-in member, because `profiles_select_authenticated` is table-wide. It is a low-sensitivity flag; move it to `profiles_private` if that changes.
