# Core Schema + RLS Design

Date: 2026-09-11
Status: Approved (design); implementation not started
Scope tier: 🔴 Core (CLAUDE.md §6)

## 1. Purpose

Establish the full 🔴 Core database foundation for Jakbar Twogether: tables,
enums, Row Level Security, the concurrency-safe registration path, and the
waitlist promotion trigger.

This is the first migration set in the project. `supabase/migrations/` is
currently empty and `types/supabase.ts` is a hand-written placeholder.

The design exists primarily to satisfy two non-negotiable rules from
CLAUDE.md §3:

- **Rule 1** — the registration decision (confirmed / waitlisted / full) is a
  single atomic operation, and waitlist promotion is a trigger, not
  application logic.
- **Rule 2** — RLS is the authorization layer, not a formality.

## 2. Decisions

| # | Decision | Chosen | Rejected alternatives |
|---|---|---|---|
| D1 | Migration scope | Full Core model (CLAUDE.md §5, all tables) | registration slice only |
| D2 | Co-host modelling | `session_hosts` join table | `sessions.host_id`; `cohost_ids uuid[]` |
| D3 | Role lookup in RLS | `profiles.role` via STABLE SECURITY DEFINER helpers | custom JWT claim; both |
| D4 | Re-registration after cancel | One row per (session, user); status flips; fresh `registered_at` | partial unique index + new row; separate audit table |
| D5 | Capacity enforcement | Hard cap for members via RPC; host RPC bypasses caps | hard cap for everyone; NULL waitlist = unlimited |
| D6 | Atomicity mechanism | `pg_advisory_xact_lock` keyed on session id | `SELECT … FOR UPDATE` on sessions row; denormalized counters |

### D3 note
Helpers must be `SECURITY DEFINER`: a policy on `profiles` that itself reads
`profiles` recurses. Role changes take effect immediately (no token-refresh
staleness), at the cost of one indexed lookup per statement.

### D4 note
Re-registering stamps a fresh `registered_at`, so a person who cancels and
returns joins the back of the queue rather than reclaiming their old position.
Per-session churn history is not retained; a `participant_events` audit table
was considered and deferred to the 🟠 Important tier alongside no-show tracking.

### D6 note
Advisory locks serialize only registrations for the *same* session; different
sessions never contend. The lock auto-releases at commit. Its weakness — that
it is held by convention, so any write path skipping the RPC also skips the
lock — is closed by RLS: `participants` has no INSERT policy and no member
UPDATE policy, so the RPCs are the only write path that exists.

## 3. Enums

```
user_role          member | host | admin
session_status     draft | scheduled | live | completed | cancelled
registration_state closed | open
participant_status confirmed | waiting_list | cancelled
session_host_role  owner | cohost
court_status       idle | in_use | unavailable
match_status       scheduled | in_progress | completed | cancelled
```

`registration_state` is deliberately separate from `session_status`, and
deliberately has no `full` value: fullness is derived
(`count(confirmed) >= max_participants`) inside the RPC under the advisory
lock. Storing it would reintroduce the stale-count race the design exists to
prevent.

## 4. Tables

- **profiles** — `id uuid PK → auth.users(id) ON DELETE CASCADE`, `full_name`,
  `avatar_url`, `phone`, `role user_role NOT NULL DEFAULT 'member'`,
  `created_at`, `updated_at`. Populated by an `AFTER INSERT ON auth.users`
  trigger so a profile always exists.
- **sessions** — `id`, `title`, `description`, `starts_at timestamptz`,
  `ends_at timestamptz`, `location`, `location_url`, `court_count int`,
  `max_participants int NOT NULL CHECK (max_participants > 0)`,
  `waitlist_capacity int NOT NULL DEFAULT 0 CHECK (waitlist_capacity >= 0)`,
  `registration_state`, `status session_status`, `created_by → profiles`,
  timestamps.

  `waitlist_capacity` is `NOT NULL` deliberately: the RPC's capacity branch
  compares `v_waiting < waitlist_capacity`, and a NULL there evaluates to NULL,
  silently falling through to "session full". A session with no waitlist is
  `waitlist_capacity = 0`, not NULL.
- **session_hosts** — `PK(session_id, user_id)`, `role session_host_role`,
  `added_at`. The owner row is created with the session.
- **participants** — `id`, `session_id`, `user_id → profiles`,
  `status participant_status`, `registered_at`, `checked_in_at timestamptz NULL`,
  `cancelled_at`, `added_by uuid NULL`, `UNIQUE(session_id, user_id)`.
- **courts** — `id`, `session_id`, `court_number int`, `status court_status`,
  `UNIQUE(session_id, court_number)`.
- **matches** — `id`, `session_id`, `court_id NULL`, `status match_status`,
  `queue_position int`, `started_at`, `completed_at`.
- **match_players** — `PK(match_id, participant_id)`,
  `team smallint CHECK (team IN (1,2))`.
- **announcements** — `id`, `session_id NULL` (null = community-wide), `title`,
  `body`, `created_by`, `published_at`.
- **galleries** — `id`, `session_id NULL`, `title`, `description`, `created_by`.
- **gallery_photos** — `id`, `gallery_id`, `storage_path`, `caption`,
  `sort_order`, `uploaded_by`.

### Deviations from CLAUDE.md §5 (intentional)

1. `starts_at` / `ends_at` as `timestamptz` instead of `date` + start/end
   `time`. Simplifies ordering, range queries, and the landing page's upcoming
   list. Trade-off: the literal local wall-clock time is not preserved
   independent of viewer timezone.
2. `checked_in_at timestamptz` replaces `checked_in bool`. Same information
   plus when, and no bool/timestamp drift. Checked in ⇔ `checked_in_at IS NOT NULL`.
3. No payment-status or no-show fields — 🟠 Important tier, additive later.

### Rule 4 enforcement
`match_players` references `participants`, not `profiles`, so matches
structurally operate on the session's participant pool. A guard trigger
rejects any `match_players` row whose participant has `checked_in_at IS NULL`
or belongs to a different session than the match — making "checked-in players
are a distinct pool" a database invariant rather than a UI convention.

## 5. RLS

### Helper functions
All `STABLE SECURITY DEFINER SET search_path = public, pg_temp`, `EXECUTE`
granted to `authenticated` only.

```
current_user_role()      -> user_role   profiles.role for auth.uid()      [0002]
is_admin()               -> boolean                                        [0002]
is_session_host(uuid)    -> boolean     admin OR row in session_hosts      [0007]
is_session_owner(uuid)   -> boolean     admin OR session_hosts.role='owner'[0007]
session_is_public(uuid)  -> boolean     status IN ('scheduled','live','completed') [0007]
```

The two profile-scoped helpers ship in the `profiles` migration, not with the
session-scoped ones: they read only `profiles`, and the role-escalation guard
in that same migration calls `is_admin()`.

### Policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | authenticated: all rows; anon: none | none (trigger only) | self or admin | admin |
| sessions | `session_is_public(id)` OR `is_session_host(id)` | role ∈ (host, admin), CHECK `created_by = auth.uid()` | `is_session_host(id)` | `is_session_host(id)` |
| session_hosts | authenticated | `is_session_owner(session_id)` | `is_session_owner(session_id)` | `is_session_owner(session_id)` |
| participants | own row; OR `is_session_host(session_id)`; OR authenticated where status ≠ cancelled AND session public | **none** | `is_session_host(session_id)` | `is_session_host(session_id)` |
| courts / matches / match_players | authenticated where parent session public or hosted | `is_session_host` | `is_session_host` | `is_session_host` |
| announcements | anon + authenticated where `published_at IS NOT NULL` AND (community-wide OR session public); hosts see own drafts | session-scoped: `is_session_host`; community-wide: admin | same | same |
| galleries / gallery_photos | public incl. anon | admin, or `is_session_host(session_id)` | same | same |

`match_players` resolves its session through `matches`.

### Privilege-escalation guard
RLS `WITH CHECK` cannot reference `OLD`, so "edit yourself but not your own
role" is not expressible as a policy. A `BEFORE UPDATE` trigger on `profiles`
raises when `NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin()`. **Without
this trigger, self-update is self-promotion to admin.** This is the only
authorization rule in the system not enforced by a policy.

The guard additionally exempts calls where `auth.uid()` is null — migrations,
`seed.sql`, the SQL editor, and any `service_role` connection. Without that
exemption the guard locks out its own bootstrap and no first admin can ever be
created (§12). Those contexts already bypass RLS entirely, so the exemption
grants them nothing they did not already have.

### Out of scope for this migration
- **Storage bucket policies** (`storage.objects` RLS) for gallery photos —
  belongs with the gallery upload feature.
- **`service_role` usage** — it bypasses RLS entirely. Reserve it for the
  `auth.users` trigger and admin scripts; general Server Actions must use the
  user's session client or none of the above applies.

## 6. Registration RPCs

All `SECURITY DEFINER SET search_path = public, pg_temp`, `EXECUTE` to
`authenticated`. These are the only write path into `participants`.

### `register_for_session(p_session_id uuid) → registration_result`

`registration_result` is a composite type
`(status participant_status, waitlist_position int)`; `waitlist_position` is
NULL when `status = 'confirmed'`, otherwise the 1-based position computed as
`count(*) + 1` over `waiting_list` rows with an earlier `registered_at`, taken
under the same lock so it cannot disagree with the row just written.

```
1. v_user := auth.uid();                       raise JB004 if null
2. PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
3. load session;   raise JB001 unless registration_state='open' AND status='scheduled'
4. existing row?   raise JB003 if status IN ('confirmed','waiting_list')
5. v_confirmed := count(*) WHERE status='confirmed';
   v_waiting   := count(*) WHERE status='waiting_list';
6. v_status := CASE WHEN v_confirmed < max_participants  THEN 'confirmed'
                    WHEN v_waiting   < waitlist_capacity THEN 'waiting_list'
                    ELSE raise JB002 END;
7. INSERT … ON CONFLICT (session_id, user_id) DO UPDATE
     SET status=v_status, registered_at=now(), cancelled_at=NULL, added_by=NULL;
8. RETURN (status, waitlist_position);
```

Steps 5–7 are a read-then-write — the exact window where two people take the
last slot. A function body is one transaction, so the lock from step 2 is held
until commit and covers that window. Step 7's `ON CONFLICT DO UPDATE` is what
re-registration after cancel looks like (D4).

### `cancel_registration(p_session_id uuid)`
Self-service. Takes the same lock so the resulting promotion cannot interleave
with an incoming registration. Sets `status='cancelled'`, `cancelled_at=now()`
on the caller's own row. JB004 if the row is not theirs.

### `host_add_participant(p_session_id, p_user_id, p_status default 'confirmed')`
JB004 unless `is_session_host()`. Takes the lock, inserts with **no capacity
check** — the sanctioned way to exceed `max_participants` (rule 3). Stamps
`added_by = auth.uid()` so over-capacity is traceable to a decision.

### `host_set_participant_status(p_participant_id, p_status)`
Host override in both directions (force-confirm off the waitlist, or cancel).
Same host check, same lock, no capacity check.

### Not an RPC
Check-in is a plain `UPDATE participants SET checked_in_at = …`, permitted by
the host UPDATE policy. No capacity invariant is involved.

### Error codes
Custom SQLSTATEs so Server Actions map to form errors without string-matching:
`JB001` registration closed or session not found, `JB002` session full,
`JB003` already registered / no active registration, `JB004` not authorized,
`JB005` invalid match player (not checked in, or wrong session — raised by the
`match_players` guard in §4).

## 7. Waitlist promotion trigger

`AFTER UPDATE ON participants FOR EACH ROW
 WHEN (OLD.status = 'confirmed' AND NEW.status = 'cancelled')`

```
1. PERFORM pg_advisory_xact_lock(…same key…);   -- re-entrant within the xact
2. skip unless sessions.status IN ('scheduled','live')
3. v_confirmed := count(*) WHERE status='confirmed';
4. if v_confirmed < max_participants:
     UPDATE participants SET status='confirmed'
      WHERE id = (SELECT id FROM participants
                   WHERE session_id=NEW.session_id AND status='waiting_list'
                   ORDER BY registered_at LIMIT 1);
```

- The `WHEN` clause is the recursion guard: step 4's transition is
  `waiting_list → confirmed`, which fails `WHEN`, so it stops after one hop.
- Only a `confirmed` cancellation promotes; leaving the waitlist frees no seat.
- `FOR EACH ROW` means a host cancelling five people in one statement promotes
  five — a statement-level trigger would promote one.
- It fires regardless of who cancelled (member RPC, host override, admin
  direct update). That is why it is a trigger, not a branch inside
  `cancel_registration`.

## 8. Indexes

```
participants   (session_id, status)
participants   (session_id, registered_at) WHERE status='waiting_list'
participants   (session_id)                WHERE checked_in_at IS NOT NULL
participants   (user_id, status)
sessions       (starts_at)                 WHERE status='scheduled'
session_hosts  (user_id)
matches        (session_id, status)
matches        (court_id)                  WHERE status='in_progress'
match_players  (participant_id)
announcements  (published_at DESC)         WHERE session_id IS NULL
gallery_photos (gallery_id, sort_order)
```

`session_hosts`' PK carries `is_session_host()`, which runs in policies on five
tables. The helpers are `STABLE`, so it is a PK lookup per distinct argument
per statement, not per row.

## 9. Realtime

```
ALTER PUBLICATION supabase_realtime
  ADD TABLE sessions, participants, courts, matches, match_players;
```

`REPLICA IDENTITY FULL` on those five — without it, DELETE and UPDATE events
arrive without old values, breaking "player removed from court" UI. Costs
extra WAL; these tables are low-write. Subscriptions are filtered by the §5
SELECT policies, so a member's channel only delivers rows they could query.

## 10. Other triggers

- `set_updated_at()` on profiles, sessions, participants, courts, matches,
  announcements, galleries.
- `handle_new_user()` `AFTER INSERT ON auth.users` → creates the profile row.
- The `profiles` role-escalation guard (§5).
- The `match_players` checked-in guard (§4).

## 11. Migration file layout

```
supabase/migrations/
  20260911000001_enums_and_utils.sql        enums, set_updated_at()
  20260911000002_profiles.sql               profiles, handle_new_user(),
                                            current_user_role(), is_admin(), role guard
  20260911000003_sessions.sql               sessions, session_hosts, owner trigger
  20260911000004_participants.sql           participants + indexes
  20260911000005_courts_matches.sql         courts, matches, match_players, JB005 guard
  20260911000006_announcements_galleries.sql
  20260911000007_rls_helpers.sql            is_session_host/owner, session_is_public
  20260911000008_rls_core.sql               RLS: profiles, sessions, session_hosts, participants
  20260911000009_rls_operations.sql         RLS: courts, matches, announcements, galleries
  20260911000010_registration.sql           the four RPCs + promotion trigger
  20260911000011_realtime.sql               publication + replica identity
```

The table migrations are split per domain, and the policies across two files,
so a reviewer can reject one group while approving its neighbour.

Session-scoped helpers land at 0007, after the tables they read, rather than
relying on plpgsql bodies not being validated at `CREATE` time. Each migration
is paired with a pgTAP file under `supabase/tests/` — see the implementation
plan at `docs/superpowers/plans/2026-09-11-core-schema-rls.md`.

## 12. Admin bootstrap

`profiles.role` defaults to `member` and only an admin may change a role, so
out of the box nobody can promote anybody. Resolution:

- `supabase/seed.sql` promotes a known local dev user, guarded to local only.
- Production requires a one-time manual
  `UPDATE profiles SET role='admin' WHERE id='<uuid>'`, documented in the
  README.

No backdoor (no "first user becomes admin" rule) — it would be a live
privilege-escalation path on a public signup form.

## 13. Concurrency test — `scripts/test-concurrent-registration.sh`

In scope for this work. The design leans entirely on the advisory lock, and a
design review cannot verify it.

- Seed a session with `max_participants = 1`, `waitlist_capacity = 2`, and N
  member accounts.
- Fire N parallel `psql` calls to `register_for_session` against the local
  Supabase stack.
- Assert: exactly one `confirmed`; up to `waitlist_capacity` `waiting_list`;
  the remainder fail with `JB002`; and `count(*) = N` with no duplicate
  `(session_id, user_id)`.
- A second case: with a full session, cancel the confirmed participant and
  assert exactly one promotion, taken in `registered_at` order.

Runs against `supabase start` locally. It fails loudly if anyone later
introduces a second write path into `participants`.

## 14. Follow-ups after this migration

- Regenerate types: `npx supabase gen types typescript --local > types/supabase.ts`
  (replaces the current placeholder).
- Zod schemas mirroring `sessions` and `participants` inputs, shared by forms
  and Server Actions.
- Storage bucket policies for gallery photos.
- 🟠 Important tier additive fields: payment status, no-show tracking,
  `participant_events` audit (see D4).

## 15. Cost of 🟢 Future features against this design

- **Automatic match generation / rotation** — `matches.queue_position` and
  `match_players.team` exist, so generation writes to the same tables; no
  schema change expected. Rotation fairness would want a read model over
  `match_players (participant_id)`, which is indexed.
- **Skill balancing** — needs `profiles.playing_level`; additive column, but
  balancing logic would sit in a function alongside the registration RPCs and
  would need its own lock discipline if it mutates `match_players` concurrently.
- **Tournaments** — does not fit `sessions` as modelled (single date, single
  location). Expect a new `tournaments` table with `sessions.tournament_id`,
  additive.
- **Payment gateway** — additive tables; the manual payment-status field from
  the 🟠 tier becomes a projection of transaction rows, so build the manual
  field as a status enum on `participants`, not as a boolean.
