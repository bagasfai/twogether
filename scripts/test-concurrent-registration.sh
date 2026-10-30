#!/usr/bin/env bash
# Proves rule 1: concurrent registrations cannot oversubscribe a session.
# Scenario B: a premium member racing non-premium members for the last seat
# always ends up confirmed, via a bump if needed, without oversubscription.
# Scenario C: one member with one quota unit registering for two sessions at
# once spends exactly one unit (premium on one session, normal on the other).
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
# Scenario B (premium bump race) and scenario C (shared quota race) sessions.
B_SESSION_ID="aaaaaaaa-0000-0000-0000-00000000f002"
C_SESSION_1="aaaaaaaa-0000-0000-0000-00000000f003"
C_SESSION_2="aaaaaaaa-0000-0000-0000-00000000f004"
ALL_SESSION_IDS="'$SESSION_ID', '$B_SESSION_ID', '$C_SESSION_1', '$C_SESSION_2'"
# How tight the simultaneous-release barrier must be for the passing run to
# actually mean something. If this is ever flaky on slower hardware, raise it
# and say so in the report — do not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS="${ARRIVAL_SPREAD_THRESHOLD_MS:-50}"

TMPDIR=$(mktemp -d)

# Runs on every exit path — pass, fail, or interrupt — so a failing run never
# leaves race fixtures behind to skew unrelated pgTAP session-visibility
# counts (e.g. 008_rls_core.test.sql) the next time `supabase test db` runs.
cleanup() {
  if [ -n "${DB_URL:-}" ]; then
    # Session delete cascades participants, and with them membership_usages
    # and bump_notifications. The memberships delete is explicit (it would
    # also cascade from auth.users via profiles) and takes their remaining
    # usages with it. No membership_plans are seeded: memberships.plan_id is
    # informational and left null.
    psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
delete from public.sessions where id in ($ALL_SESSION_IDS);
delete from public.memberships
 where user_id in (select id from auth.users where email like 'race%@test.local');
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
-- (from a prior run) blocking the profile delete via that FK. All scenarios'
-- sessions, since every one of them is created by racehost.
delete from public.sessions where id in ($ALL_SESSION_IDS);
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

# ---------------------------------------------------------------------------
# Shared helpers for scenarios B and C. Same worker shape as scenario A:
# wait for the barrier, record the arrival in autocommit, then call the RPC
# as the real authenticated user in its own transaction.
# ---------------------------------------------------------------------------

# race_worker <user id> <session id> <output file> <start epoch>
# Runs in the background; the caller must `wait`.
race_worker() {
  local uid=$1 sid=$2 out=$3 start=$4
  (
    psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$out" 2>&1 <<SQL
\set VERBOSITY verbose
select pg_sleep_until(to_timestamp($start));
insert into public._race_arrivals (worker, arrived_at) values ('$uid', clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$uid","role":"authenticated"}';
select public.register_for_session('$sid');
commit;
SQL
    echo "EXIT:$?" >> "$out"
  ) &
}

# Prints the barrier spread in ms of the arrivals currently recorded.
arrival_spread_ms() {
  psql "$DB_URL" -At -c \
    "select coalesce(round(extract(epoch from (max(arrived_at) - min(arrived_at))) * 1000)::int, -1) from public._race_arrivals"
}

# Every worker in scenarios B and C must succeed: their capacities are sized
# so no legitimate JB002 exists. Prints each failing worker's output.
# check_workers_ok <label> <output file>...
check_workers_ok() {
  local label=$1 bad=0 f
  shift
  for f in "$@"; do
    if ! grep -q "^EXIT:0$" "$f"; then
      bad=$((bad + 1))
      echo "FAIL: $label worker $(basename "$f" .out) did not succeed:"
      sed 's/^/  /' "$f"
    fi
  done
  [ "$bad" = 0 ]
}

# ---------------------------------------------------------------------------
# Scenario B: premium vs non-premium race for the last seat.
#
# A one-seat session, B_RACERS non-premium callers plus one premium caller,
# all released at once. The interleaving is not controlled, so the
# assertions are invariants that hold in every interleaving:
# * exactly one confirmed (no oversubscription), and it is the premium
#   member: if a non-premium caller won the seat first, that row is bumpable
#   (registered by the member, not checked in, not host-added), so the
#   premium caller bumps it;
# * bump_notifications rows = participants with bumped_at set, at most 1;
# * a bumped participant is waiting_list, never confirmed.
# The waitlist cap equals B_RACERS, so every caller fits (a bump ignores the
# cap anyway) and every worker must succeed.
# ---------------------------------------------------------------------------
B_RACERS=15
B_FAIL=0
B_DIR="$TMPDIR/b"
mkdir -p "$B_DIR"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
delete from public.sessions where id = '$B_SESSION_ID';
delete from public.memberships
 where user_id in (select id from auth.users where email like 'raceb%@test.local');
delete from auth.users where email like 'raceb%@test.local';
drop table if exists public._race_arrivals;
create table public._race_arrivals (worker uuid not null, arrived_at timestamptz not null);

insert into auth.users (id, email)
select gen_random_uuid(), 'raceb' || g || '@test.local'
  from generate_series(1, $B_RACERS) g;

insert into auth.users (id, email) values
  (gen_random_uuid(), 'racebpremium@test.local');

-- Current membership: started, not expired, quota to spare.
insert into public.memberships
  (user_id, price_idr, quota_total, duration_days, payment_received_at,
   started_at, expires_at)
select id, 0, 5, 30, now(), now() - interval '1 hour', now() + interval '29 days'
  from auth.users where email = 'racebpremium@test.local';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('$B_SESSION_ID', 'Race Session B',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 1, $B_RACERS,
   (select id from auth.users where email = 'racehost@test.local'),
   'scheduled', 'open');
SQL

B_PREMIUM_ID=$(psql "$DB_URL" -At -c "select id from auth.users where email = 'racebpremium@test.local'")
B_MEMBERSHIP_ID=$(psql "$DB_URL" -At -c "select id from public.memberships where user_id = '$B_PREMIUM_ID'")
mapfile -t B_USER_IDS < <(psql "$DB_URL" -At -c \
  "select id from auth.users where email like 'raceb%@test.local' order by email")

B_START=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '3 seconds')")
for uid in "${B_USER_IDS[@]}"; do
  race_worker "$uid" "$B_SESSION_ID" "$B_DIR/$uid.out" "$B_START"
done
wait

B_ARRIVALS=$(psql "$DB_URL" -At -c "select count(*) from public._race_arrivals")
[ "$B_ARRIVALS" = "$((B_RACERS + 1))" ] || {
  echo "FAIL: B expected $((B_RACERS + 1)) arrivals at the barrier, got $B_ARRIVALS"
  B_FAIL=1
}
B_SPREAD_MS=$(arrival_spread_ms)
echo "INFO: B barrier spread across $B_ARRIVALS arrivals: ${B_SPREAD_MS}ms (threshold ${ARRIVAL_SPREAD_THRESHOLD_MS}ms)"
if [ "$B_SPREAD_MS" -lt 0 ] || [ "$B_SPREAD_MS" -ge "$ARRIVAL_SPREAD_THRESHOLD_MS" ]; then
  echo "FAIL: B barrier spread ${B_SPREAD_MS}ms >= ${ARRIVAL_SPREAD_THRESHOLD_MS}ms — workers were not released simultaneously"
  B_FAIL=1
fi

check_workers_ok B "$B_DIR"/*.out || B_FAIL=1

IFS='|' read -r B_CONFIRMED B_PREMIUM_STATUS B_PREMIUM_FLAG B_WAITING B_TOTAL \
  B_BUMPED B_NOTIFS B_BUMPED_CONFIRMED B_BUMPED_NOT_WAITING B_LIVE_USAGES B_QUOTA_LEFT \
  < <(psql "$DB_URL" -At -F'|' <<SQL
select
  (select count(*) from public.participants
    where session_id = '$B_SESSION_ID' and status = 'confirmed'),
  (select status from public.participants
    where session_id = '$B_SESSION_ID' and user_id = '$B_PREMIUM_ID'),
  (select is_premium from public.participants
    where session_id = '$B_SESSION_ID' and user_id = '$B_PREMIUM_ID'),
  (select count(*) from public.participants
    where session_id = '$B_SESSION_ID' and status = 'waiting_list'),
  (select count(*) from public.participants where session_id = '$B_SESSION_ID'),
  (select count(*) from public.participants
    where session_id = '$B_SESSION_ID' and bumped_at is not null),
  (select count(*) from public.bump_notifications n
     join public.participants p on p.id = n.participant_id
    where p.session_id = '$B_SESSION_ID'),
  (select count(*) from public.participants
    where session_id = '$B_SESSION_ID' and bumped_at is not null and status = 'confirmed'),
  (select count(*) from public.participants
    where session_id = '$B_SESSION_ID' and bumped_at is not null and status <> 'waiting_list'),
  (select count(*) from public.membership_usages
    where membership_id = '$B_MEMBERSHIP_ID' and refunded_at is null),
  public.membership_quota_left('$B_MEMBERSHIP_ID');
SQL
) || true  # a failed query leaves the fields empty, which the checks below report

[ "$B_CONFIRMED" = 1 ] || { echo "FAIL: B expected 1 confirmed, got $B_CONFIRMED (oversubscribed or empty)"; B_FAIL=1; }
[ "$B_PREMIUM_STATUS" = "confirmed" ] || { echo "FAIL: B premium member is '$B_PREMIUM_STATUS', expected confirmed"; B_FAIL=1; }
[ "$B_PREMIUM_FLAG" = "t" ] || { echo "FAIL: B premium member row has is_premium='$B_PREMIUM_FLAG'"; B_FAIL=1; }
[ "$B_WAITING" = "$B_RACERS" ] || { echo "FAIL: B expected $B_RACERS waitlisted, got $B_WAITING"; B_FAIL=1; }
[ "$B_TOTAL" = "$((B_RACERS + 1))" ] || { echo "FAIL: B expected $((B_RACERS + 1)) rows, got $B_TOTAL"; B_FAIL=1; }
[ "$B_NOTIFS" = "$B_BUMPED" ] || { echo "FAIL: B bump_notifications ($B_NOTIFS) != bumped participants ($B_BUMPED)"; B_FAIL=1; }
[ "$B_BUMPED" -le 1 ] || { echo "FAIL: B expected at most 1 bumped participant, got $B_BUMPED"; B_FAIL=1; }
[ "$B_BUMPED_CONFIRMED" = 0 ] || { echo "FAIL: B $B_BUMPED_CONFIRMED participant(s) have bumped_at set but are confirmed"; B_FAIL=1; }
[ "$B_BUMPED_NOT_WAITING" = 0 ] || { echo "FAIL: B $B_BUMPED_NOT_WAITING bumped participant(s) are not waiting_list"; B_FAIL=1; }
[ "$B_LIVE_USAGES" = 1 ] || { echo "FAIL: B expected 1 live usage for the premium membership, got $B_LIVE_USAGES"; B_FAIL=1; }
[ "$B_QUOTA_LEFT" = 4 ] || { echo "FAIL: B expected quota_left 4, got $B_QUOTA_LEFT"; B_FAIL=1; }

if [ "$B_FAIL" = 0 ]; then
  if [ "$B_BUMPED" = 1 ]; then B_PATH="non-premium won first, premium bumped it"; else B_PATH="premium won the seat first, no bump"; fi
  echo "PASS: B $B_RACERS non-premium + 1 premium racers, 1 confirmed (premium), $B_WAITING waitlisted, $B_BUMPED bumped = $B_NOTIFS notification(s) ($B_PATH), barrier spread ${B_SPREAD_MS}ms"
else
  fail=1
fi

# ---------------------------------------------------------------------------
# Scenario C (review focus 5): one quota unit, two sessions at once.
#
# One member whose current membership has quota_total = 1 registers for two
# empty one-seat sessions concurrently. The two calls take different session
# advisory locks, so only the membership row lock serializes them. Both must
# succeed and be confirmed; exactly one is premium; exactly one live usage
# exists, pointing at the premium row; quota_left ends at 0 (no overspend).
# One race pass proves little, so it runs C_ROUNDS times with a fresh seed.
# ---------------------------------------------------------------------------
C_ROUNDS="${C_ROUNDS:-20}"
C_FAIL=0
C_MAX_SPREAD=0
C_PREMIUM_ON_1=0
C_PREMIUM_ON_2=0

for round in $(seq 1 "$C_ROUNDS"); do
  C_DIR="$TMPDIR/c$round"
  mkdir -p "$C_DIR"
  round_fail=0

  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
delete from public.sessions where id in ('$C_SESSION_1', '$C_SESSION_2');
delete from public.memberships
 where user_id in (select id from auth.users where email like 'racec%@test.local');
delete from auth.users where email like 'racec%@test.local';
truncate public._race_arrivals;

insert into auth.users (id, email) values (gen_random_uuid(), 'racec@test.local');

insert into public.memberships
  (user_id, price_idr, quota_total, duration_days, payment_received_at,
   started_at, expires_at)
select id, 0, 1, 30, now(), now() - interval '1 hour', now() + interval '29 days'
  from auth.users where email = 'racec@test.local';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
select s.id, s.title,
       now() + interval '1 day', now() + interval '1 day 2 hours',
       'GOR Jakbar', 1, 0,
       (select id from auth.users where email = 'racehost@test.local'),
       'scheduled', 'open'
  from (values ('$C_SESSION_1'::uuid, 'Race Session C1'),
               ('$C_SESSION_2'::uuid, 'Race Session C2')) s (id, title);
SQL

  C_USER_ID=$(psql "$DB_URL" -At -c "select id from auth.users where email = 'racec@test.local'")
  C_MEMBERSHIP_ID=$(psql "$DB_URL" -At -c "select id from public.memberships where user_id = '$C_USER_ID'")

  C_START=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '1 second')")
  race_worker "$C_USER_ID" "$C_SESSION_1" "$C_DIR/s1.out" "$C_START"
  race_worker "$C_USER_ID" "$C_SESSION_2" "$C_DIR/s2.out" "$C_START"
  wait

  C_ARRIVALS=$(psql "$DB_URL" -At -c "select count(*) from public._race_arrivals")
  [ "$C_ARRIVALS" = 2 ] || { echo "FAIL: C round $round expected 2 arrivals, got $C_ARRIVALS"; round_fail=1; }
  C_SPREAD_MS=$(arrival_spread_ms)
  if [ "$C_SPREAD_MS" -lt 0 ] || [ "$C_SPREAD_MS" -ge "$ARRIVAL_SPREAD_THRESHOLD_MS" ]; then
    echo "FAIL: C round $round barrier spread ${C_SPREAD_MS}ms >= ${ARRIVAL_SPREAD_THRESHOLD_MS}ms"
    round_fail=1
  fi
  if [ "$C_SPREAD_MS" -gt "$C_MAX_SPREAD" ]; then C_MAX_SPREAD=$C_SPREAD_MS; fi

  check_workers_ok "C round $round" "$C_DIR/s1.out" "$C_DIR/s2.out" || round_fail=1

  IFS='|' read -r C_ROWS C_CONFIRMED C_PREMIUM C_NORMAL C_LIVE_USAGES C_QUOTA_LEFT \
    C_USAGE_ON_PREMIUM C_PREMIUM_SESSION \
    < <(psql "$DB_URL" -At -F'|' <<SQL
select
  (select count(*) from public.participants
    where user_id = '$C_USER_ID' and session_id in ('$C_SESSION_1', '$C_SESSION_2')),
  (select count(*) from public.participants
    where user_id = '$C_USER_ID' and session_id in ('$C_SESSION_1', '$C_SESSION_2')
      and status = 'confirmed'),
  (select count(*) from public.participants
    where user_id = '$C_USER_ID' and session_id in ('$C_SESSION_1', '$C_SESSION_2')
      and is_premium and membership_id = '$C_MEMBERSHIP_ID'),
  (select count(*) from public.participants
    where user_id = '$C_USER_ID' and session_id in ('$C_SESSION_1', '$C_SESSION_2')
      and not is_premium and membership_id is null),
  (select count(*) from public.membership_usages
    where membership_id = '$C_MEMBERSHIP_ID' and refunded_at is null),
  public.membership_quota_left('$C_MEMBERSHIP_ID'),
  (select count(*) from public.membership_usages u
     join public.participants p on p.id = u.participant_id
    where u.membership_id = '$C_MEMBERSHIP_ID' and u.refunded_at is null
      and p.is_premium),
  (select session_id from public.participants
    where user_id = '$C_USER_ID' and is_premium
      and session_id in ('$C_SESSION_1', '$C_SESSION_2')
    limit 1);
SQL
  ) || true  # a failed query leaves the fields empty, which the checks below report

  [ "$C_ROWS" = 2 ] || { echo "FAIL: C round $round expected 2 participant rows, got $C_ROWS"; round_fail=1; }
  [ "$C_CONFIRMED" = 2 ] || { echo "FAIL: C round $round expected both registrations confirmed, got $C_CONFIRMED"; round_fail=1; }
  [ "$C_PREMIUM" = 1 ] || { echo "FAIL: C round $round expected exactly 1 premium row, got $C_PREMIUM"; round_fail=1; }
  [ "$C_NORMAL" = 1 ] || { echo "FAIL: C round $round expected exactly 1 non-premium row, got $C_NORMAL"; round_fail=1; }
  [ "$C_LIVE_USAGES" = 1 ] || { echo "FAIL: C round $round expected 1 live usage, got $C_LIVE_USAGES (overspend if > 1)"; round_fail=1; }
  [ "$C_QUOTA_LEFT" = 0 ] || { echo "FAIL: C round $round expected quota_left 0, got $C_QUOTA_LEFT"; round_fail=1; }
  [ "$C_USAGE_ON_PREMIUM" = 1 ] || { echo "FAIL: C round $round live usage does not point at the premium row"; round_fail=1; }

  if [ "$C_PREMIUM_SESSION" = "$C_SESSION_1" ]; then
    C_PREMIUM_ON_1=$((C_PREMIUM_ON_1 + 1))
  elif [ "$C_PREMIUM_SESSION" = "$C_SESSION_2" ]; then
    C_PREMIUM_ON_2=$((C_PREMIUM_ON_2 + 1))
  fi
  [ "$round_fail" = 0 ] || C_FAIL=1
done

if [ "$C_FAIL" = 0 ]; then
  echo "PASS: C $C_ROUNDS rounds, 1 quota unit / 2 concurrent sessions: always 1 premium + 1 normal, 1 live usage, quota_left 0 (premium won session 1 in $C_PREMIUM_ON_1 rounds, session 2 in $C_PREMIUM_ON_2), max barrier spread ${C_MAX_SPREAD}ms"
else
  fail=1
fi

exit "$fail"
