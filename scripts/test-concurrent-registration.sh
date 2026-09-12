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
# How tight the simultaneous-release barrier must be for the passing run to
# actually mean something. If this is ever flaky on slower hardware, raise it
# and say so in the report — do not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS=50

TMPDIR=$(mktemp -d)

# Runs on every exit path — pass, fail, or interrupt — so a failing run never
# leaves race fixtures behind to skew unrelated pgTAP session-visibility
# counts (e.g. 008_rls_core.test.sql) the next time `supabase test db` runs.
cleanup() {
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email like 'race%@test.local';
drop table if exists public._race_arrivals;
SQL
  fi
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
-- sessions first: created_by references profiles, which cascades from
-- auth.users, so deleting auth.users first would leave a leftover session
-- (from a prior run) blocking the profile delete via that FK.
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email like 'race%@test.local';
drop table if exists public._race_arrivals;

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

-- Scratch table so the barrier itself is assertable, not just assumed. Each
-- worker records when it was actually released, before calling the RPC.
create table public._race_arrivals (worker uuid not null, arrived_at timestamptz not null);
SQL

# Every racer waits for the same wall-clock instant, then fires. Without the
# barrier the processes trickle in and the race never actually happens.
START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '5 seconds')")

mapfile -t USER_IDS < <(psql "$DB_URL" -At -c \
  "select id from auth.users where email like 'race%@test.local' and email <> 'racehost@test.local' order by email")

for uid in "${USER_IDS[@]}"; do
  (
    psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$TMPDIR/$uid.out" 2>&1 <<SQL
\set VERBOSITY verbose
-- Autocommit, deliberately OUTSIDE the registration transaction below: if
-- the arrival insert were part of that transaction, a worker rejected with
-- JB002 would roll its own arrival row back along with the rejection,
-- silently undercounting arrivals and corrupting the spread measurement.
select pg_sleep_until(to_timestamp($START_EPOCH));
insert into public._race_arrivals (worker, arrived_at) values ('$uid', clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$uid","role":"authenticated"}';
select public.register_for_session('$SESSION_ID');
commit;
SQL
    echo "EXIT:$?" >> "$TMPDIR/$uid.out"
  ) &
done
wait

fail=0

# --- Barrier assertions: prove the release was actually simultaneous, not a
# sequential trickle that happens to land on the same final counts. ---
ARRIVALS=$(psql "$DB_URL" -At -c "select count(*) from public._race_arrivals")
[ "$ARRIVALS" = "$RACERS" ] || {
  echo "FAIL: expected $RACERS arrivals at the barrier, got $ARRIVALS (some workers never reached it)"
  fail=1
}

SPREAD_MS=$(psql "$DB_URL" -At -c \
  "select coalesce(round(extract(epoch from (max(arrived_at) - min(arrived_at))) * 1000)::int, -1) from public._race_arrivals")
echo "INFO: barrier spread across $ARRIVALS arrivals: ${SPREAD_MS}ms (threshold ${ARRIVAL_SPREAD_THRESHOLD_MS}ms)"
if [ "$SPREAD_MS" -lt 0 ] || [ "$SPREAD_MS" -ge "$ARRIVAL_SPREAD_THRESHOLD_MS" ]; then
  echo "FAIL: barrier spread ${SPREAD_MS}ms >= ${ARRIVAL_SPREAD_THRESHOLD_MS}ms — workers were not released simultaneously"
  fail=1
fi

# --- Per-worker outcome classification: a worker that fails for a reason
# other than JB002 (session full) must not be silently indistinguishable from
# a legitimate rejection. ---
BAD_WORKERS=0
for f in "$TMPDIR"/*.out; do
  [ -e "$f" ] || continue
  if grep -q "^EXIT:0$" "$f"; then
    continue
  fi
  if ! grep -q "JB002" "$f"; then
    BAD_WORKERS=$((BAD_WORKERS + 1))
    echo "FAIL: worker $(basename "$f" .out) failed without JB002:"
    sed 's/^/  /' "$f"
  fi
done
[ "$BAD_WORKERS" = 0 ] || fail=1

CONFIRMED=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID' and status = 'confirmed'")
WAITING=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID' and status = 'waiting_list'")
TOTAL=$(psql "$DB_URL" -At -c \
  "select count(*) from public.participants where session_id = '$SESSION_ID'")

[ "$CONFIRMED" = "$SEATS" ] || { echo "FAIL: expected $SEATS confirmed, got $CONFIRMED"; fail=1; }
[ "$WAITING" = "$WAITLIST" ] || { echo "FAIL: expected $WAITLIST waitlisted, got $WAITING"; fail=1; }
[ "$TOTAL" = "$((SEATS + WAITLIST))" ] || { echo "FAIL: expected $((SEATS + WAITLIST)) rows, got $TOTAL"; fail=1; }

# Promotion: the confirmed racer cancels, the oldest waitlister takes the
# seat. Only meaningful once the registration outcome above is exactly what
# it should be — with more than one confirmed row this would itself blow up
# (multiple ids into one JSON claim), so skip it cleanly instead of crashing.
if [ "$fail" = 0 ]; then
  CONFIRMED_ID=$(psql "$DB_URL" -At -c \
    "select user_id from public.participants where session_id = '$SESSION_ID' and status = 'confirmed' limit 1")
  # Same total order as promote_from_waitlist's ORDER BY: registered_at, then
  # id as the deterministic tie-break. registered_at alone can collide at
  # microsecond resolution under real contention.
  NEXT_UP=$(psql "$DB_URL" -At -c \
    "select user_id from public.participants where session_id = '$SESSION_ID' and status = 'waiting_list' order by registered_at, id limit 1")

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
else
  echo "SKIP: promotion check skipped — registration outcome above was already wrong"
fi

if [ "$fail" = 0 ]; then
  echo "PASS: $RACERS racers, $CONFIRMED confirmed, $WAITING waitlisted, barrier spread ${SPREAD_MS}ms, promotion in (registered_at, id) order"
fi
exit "$fail"
