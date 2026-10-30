#!/usr/bin/env bash
# Proves the drilling RPCs hold under concurrency. Three scenarios run in every
# round, on their own sessions, released by one barrier:
#   A  two simultaneous transfers of the same seat to different members: exactly
#      one wins, the loser gets JB022 (seat no longer confirmed), the confirmed
#      count is unchanged and replaced_by points at the winner's row.
#   B  a transfer racing a registration for the last open seat: both succeed, the
#      registrant is confirmed (no lost seat), confirmed == max_participants (no
#      overbooking), the handed-over row is cancelled and not promoted over.
#   C  a capacity raise (1 -> 2 coaches) racing a registration and a cancellation
#      with a long waitlist: confirmed never exceeds max_participants, the seats
#      go to the waitlist in order, and the new registrant queues behind it.
# Any 40P01 (deadlock) or 40001 (serialization failure) fails the run: the RPCs
# take pg_advisory_xact_lock(session_lock_key) and must never produce either.
# Requires a running local stack (npx supabase start).
set -euo pipefail

# Derive the URL from the CLI, falling back to the container's published port
# (`supabase status` fails on some local configs). Never hardcode a port:
# another Supabase stack on this machine may own the default.
if [ -z "${DB_URL:-}" ]; then
  DB_URL=$(npx --no-install supabase status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p' || true)
fi
if [ -z "${DB_URL:-}" ]; then
  PORT=$(docker port supabase_db_twogether 5432/tcp 2>/dev/null | head -n1 | sed 's/.*://' || true)
  [ -n "$PORT" ] && DB_URL="postgresql://postgres:postgres@127.0.0.1:$PORT/postgres"
fi
[ -n "${DB_URL:-}" ] || { echo "FAIL: could not determine DB_URL; is the stack running?"; exit 1; }

# Refuse to touch a database that is not this project's.
GUARD=$(psql "$DB_URL" -At -c \
  "select coalesce(to_regclass('public.participants') is not null
                   and to_regproc('public.transfer_participation') is not null
                   and to_regproc('public.adjust_session_capacity') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL is not this project's database (no participants table / transfer_participation / adjust_session_capacity)."
  echo "      Refusing to run destructive statements against it."
  exit 1
}

ROUNDS="${ROUNDS:-20}"
# If this is flaky on slower hardware, raise it and say so in the report; do
# not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS="${ARRIVAL_SPREAD_THRESHOLD_MS:-100}"
BARRIER_LEAD_S="${BARRIER_LEAD_S:-2}"
HOST_ID="22222222-2222-4222-8222-0000000000fd"
TITLE="Drill Race"

TMPDIR=$(mktemp -d)

# Ids derive from the round so setup, workers and checks agree.
# sid <round> <A|B|C> ; uid <round> <n>
sid() { local k; case "$2" in A) k=1;; B) k=2;; C) k=3;; esac
        printf 'aaaaaaaa-0000-4000-8000-%012d' "$(( $1 * 10 + k ))"; }
uid() { printf '11111111-0000-4000-8000-%012d' "$(( $1 * 100 + $2 ))"; }

# Fixtures are per round; users are created once and removed at exit.
drop_round() {
  psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
delete from public.sessions where title = '$TITLE';
SQL
}
cleanup() {
  psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
delete from public.sessions where title = '$TITLE';
delete from auth.users where email like 'drillrace%@test.local';
drop table if exists public._drill_race_arrivals;
SQL
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
delete from public.sessions where title = '$TITLE';
delete from auth.users where email like 'drillrace%@test.local';
drop table if exists public._drill_race_arrivals;

insert into auth.users (id, email) values ('$HOST_ID', 'drillracehost@test.local');
insert into auth.users (id, email)
select ('11111111-0000-4000-8000-' || lpad((r * 100 + n)::text, 12, '0'))::uuid,
       'drillrace' || r || '-' || n || '@test.local'
  from generate_series(1, $ROUNDS) r, generate_series(1, 20) n;

-- Autocommit arrivals so the barrier is assertable (see the registration script).
create table public._drill_race_arrivals (worker text not null, arrived_at timestamptz not null);
SQL

setup_round() {
  local r=$1
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
truncate public._drill_race_arrivals;

-- max_participants = coach_count * seats_per_coach, court_count = coach_count.
insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   court_count, kind, coach_count, seats_per_coach, created_by, status, registration_state)
values
  ('$(sid "$r" A)', '$TITLE', now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 4, 10, 1, 'drilling', 1, 4, '$HOST_ID', 'scheduled', 'open'),
  ('$(sid "$r" B)', '$TITLE', now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 4, 10, 1, 'drilling', 1, 4, '$HOST_ID', 'scheduled', 'open'),
  ('$(sid "$r" C)', '$TITLE', now() + interval '3 days', now() + interval '3 days 2 hours',
   'GOR Jakbar', 2, 10, 1, 'drilling', 1, 2, '$HOST_ID', 'scheduled', 'open');
insert into public.courts (session_id, court_number)
select s, 1 from (values ('$(sid "$r" A)'::uuid), ('$(sid "$r" B)'), ('$(sid "$r" C)')) v(s);

-- A: full. users 1 = owner of the contested seat, 2/3 = transfer targets, 4..6 fillers.
-- B: 3 of 4 seats. 1 = owner, 2 = transfer target, 3 = registrant, 4..5 fillers.
-- C: 2 confirmed (1 = canceller, 2), waitlist 3..6 in order, 7 = new registrant.
insert into public.participants (session_id, user_id, status, registered_at)
select s.sid::uuid, ('11111111-0000-4000-8000-' || lpad(($r * 100 + s.n)::text, 12, '0'))::uuid,
       s.st::public.participant_status, now() - make_interval(mins => 100 - s.n)
  from (values
    ('$(sid "$r" A)', 1, 'confirmed'), ('$(sid "$r" A)', 4, 'confirmed'),
    ('$(sid "$r" A)', 5, 'confirmed'), ('$(sid "$r" A)', 6, 'confirmed'),
    ('$(sid "$r" B)', 1, 'confirmed'), ('$(sid "$r" B)', 4, 'confirmed'),
    ('$(sid "$r" B)', 5, 'confirmed'),
    ('$(sid "$r" C)', 1, 'confirmed'), ('$(sid "$r" C)', 2, 'confirmed'),
    ('$(sid "$r" C)', 3, 'waiting_list'), ('$(sid "$r" C)', 4, 'waiting_list'),
    ('$(sid "$r" C)', 5, 'waiting_list'), ('$(sid "$r" C)', 6, 'waiting_list')
  ) s(sid, n, st);
SQL
}

# worker <round> <label> <caller uuid> <sql statement>
worker() {
  local r=$1 label=$2 caller=$3 stmt=$4 rc=0
  psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$TMPDIR/r${r}_${label}.out" 2>&1 <<SQL || rc=$?
\set VERBOSITY verbose
select pg_sleep_until(to_timestamp($START_EPOCH));
insert into public._drill_race_arrivals (worker, arrived_at) values ('r${r}_${label}', clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$caller","role":"authenticated"}';
$stmt
commit;
SQL
  echo "EXIT:$rc" >> "$TMPDIR/r${r}_${label}.out"
}

fail=0
total_arrivals=0
max_spread=0
a_wins_t1=0 a_wins_t2=0

for r in $(seq 1 "$ROUNDS"); do
  setup_round "$r"
  START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '$BARRIER_LEAD_S seconds')")

  A1=$(psql "$DB_URL" -At -c "select id from participants where session_id='$(sid "$r" A)' and user_id='$(uid "$r" 1)'")
  B1=$(psql "$DB_URL" -At -c "select id from participants where session_id='$(sid "$r" B)' and user_id='$(uid "$r" 1)'")

  worker "$r" A1 "$(uid "$r" 1)" "select public.transfer_participation('$A1', '$(uid "$r" 2)');" &
  worker "$r" A2 "$(uid "$r" 1)" "select public.transfer_participation('$A1', '$(uid "$r" 3)');" &
  worker "$r" Bt "$(uid "$r" 1)" "select public.transfer_participation('$B1', '$(uid "$r" 2)');" &
  worker "$r" Br "$(uid "$r" 3)" "select public.register_for_session('$(sid "$r" B)');" &
  worker "$r" Cr "$HOST_ID"      "select public.adjust_session_capacity('$(sid "$r" C)', 2);" &
  worker "$r" Cg "$(uid "$r" 7)" "select public.register_for_session('$(sid "$r" C)');" &
  worker "$r" Cc "$(uid "$r" 1)" "select public.cancel_registration('$(sid "$r" C)');" &
  wait

  # --- barrier ---
  ARR=$(psql "$DB_URL" -At -c "select count(*) from public._drill_race_arrivals")
  [ "$ARR" = 7 ] || { echo "FAIL: round $r: expected 7 arrivals at the barrier, got $ARR"; fail=1; }
  total_arrivals=$((total_arrivals + ARR))
  SPREAD=$(psql "$DB_URL" -At -c \
    "select coalesce(round(extract(epoch from (max(arrived_at) - min(arrived_at))) * 1000)::int, -1) from public._drill_race_arrivals")
  [ "$SPREAD" -gt "$max_spread" ] && max_spread=$SPREAD
  if [ "$SPREAD" -lt 0 ] || [ "$SPREAD" -ge "$ARRIVAL_SPREAD_THRESHOLD_MS" ]; then
    echo "FAIL: round $r: barrier spread ${SPREAD}ms >= ${ARRIVAL_SPREAD_THRESHOLD_MS}ms; workers were not released simultaneously"
    fail=1
  fi

  # --- deadlocks / serialization failures anywhere are always a failure ---
  if grep -lE "40P01|40001|deadlock detected|could not serialize" "$TMPDIR"/r${r}_*.out >/dev/null 2>&1; then
    echo "FAIL: round $r: deadlock or serialization failure:"
    grep -hE "40P01|40001|deadlock|serialize" "$TMPDIR"/r${r}_*.out | sed 's/^/  /'
    fail=1
  fi

  # --- outcomes: B and C workers must all succeed; A has one win + one JB022 ---
  for label in Bt Br Cr Cg Cc; do
    grep -q "^EXIT:0$" "$TMPDIR/r${r}_${label}.out" || {
      echo "FAIL: round $r worker $label failed:"; sed 's/^/  /' "$TMPDIR/r${r}_${label}.out"; fail=1; }
  done
  wins=0 lost=0
  for label in A1 A2; do
    f="$TMPDIR/r${r}_${label}.out"
    if grep -q "^EXIT:0$" "$f"; then wins=$((wins + 1))
    elif grep -q "JB022" "$f"; then lost=$((lost + 1))
    else echo "FAIL: round $r worker $label failed without JB022:"; sed 's/^/  /' "$f"; fail=1; fi
  done
  [ "$wins" = 1 ] && [ "$lost" = 1 ] || {
    echo "FAIL: round $r scenario A expected 1 win + 1 JB022, got $wins win(s) + $lost JB022"; fail=1; }

  # --- invariants ---
  q() { psql "$DB_URL" -At -c "$1"; }
  conf() { q "select count(*) from participants where session_id='$1' and status='confirmed'"; }

  # A: confirmed unchanged (4); exactly one of the targets holds a seat; old row
  # points at the winner; the loser target has no row.
  a_conf=$(conf "$(sid "$r" A)")
  a_targets=$(q "select count(*) from participants where session_id='$(sid "$r" A)' and user_id in ('$(uid "$r" 2)','$(uid "$r" 3)') and status='confirmed'")
  a_ptr=$(q "select count(*) from participants o join participants n on n.id = o.replaced_by
              where o.id='$A1' and o.status='cancelled' and n.status='confirmed' and n.paid_by_user_id='$(uid "$r" 1)'")
  a_rows=$(q "select count(*) from participants where session_id='$(sid "$r" A)'")
  [ "$a_conf" = 4 ] && [ "$a_targets" = 1 ] && [ "$a_ptr" = 1 ] && [ "$a_rows" = 5 ] || {
    echo "FAIL: round $r scenario A: confirmed=$a_conf (want 4) targets_confirmed=$a_targets (want 1) replaced_by_ok=$a_ptr (want 1) rows=$a_rows (want 5)"; fail=1; }

  # B: confirmed == max (4), registrant and target confirmed, owner cancelled
  # and handed over, nobody waitlisted.
  b_conf=$(conf "$(sid "$r" B)")
  b_reg=$(q "select count(*) from participants where session_id='$(sid "$r" B)' and user_id='$(uid "$r" 3)' and status='confirmed'")
  b_tgt=$(q "select count(*) from participants where session_id='$(sid "$r" B)' and user_id='$(uid "$r" 2)' and status='confirmed'")
  b_old=$(q "select count(*) from participants where id='$B1' and status='cancelled' and replaced_by is not null")
  b_wait=$(q "select count(*) from participants where session_id='$(sid "$r" B)' and status='waiting_list'")
  [ "$b_conf" = 4 ] && [ "$b_reg" = 1 ] && [ "$b_tgt" = 1 ] && [ "$b_old" = 1 ] && [ "$b_wait" = 0 ] || {
    echo "FAIL: round $r scenario B: confirmed=$b_conf (want 4) registrant=$b_reg target=$b_tgt old_handed_over=$b_old waitlist=$b_wait (want 4,1,1,1,0)"; fail=1; }

  # C: capacity is 4; confirmed == 4 and never above max; confirmed = {2,3,4,5}
  # (waitlisters promoted in order), waitlist = 6 then 7 in registered_at order.
  c_max=$(q "select max_participants from sessions where id='$(sid "$r" C)'")
  c_conf=$(conf "$(sid "$r" C)")
  c_confset=$(q "select string_agg(right(user_id::text, 2), ',' order by user_id) from participants where session_id='$(sid "$r" C)' and status='confirmed'")
  c_waitset=$(q "select string_agg(right(user_id::text, 2), ',' order by registered_at, id) from participants where session_id='$(sid "$r" C)' and status='waiting_list'")
  c_courts=$(q "select count(*) from courts where session_id='$(sid "$r" C)'")
  want_conf="$(printf '%02d,%02d,%02d,%02d' 2 3 4 5)"; want_wait="$(printf '%02d,%02d' 6 7)"
  [ "$c_max" = 4 ] && [ "$c_conf" -le "$c_max" ] && [ "$c_conf" = 4 ] \
    && [ "$c_confset" = "$want_conf" ] && [ "$c_waitset" = "$want_wait" ] && [ "$c_courts" = 2 ] || {
    echo "FAIL: round $r scenario C: max=$c_max confirmed=$c_conf confirmed_users=$c_confset (want $want_conf) waitlist_order=$c_waitset (want $want_wait) courts=$c_courts (want 2)"; fail=1; }

  # tally who won A, for the INFO line
  if [ "$(q "select count(*) from participants where session_id='$(sid "$r" A)' and user_id='$(uid "$r" 2)' and status='confirmed'")" = 1 ]; then
    a_wins_t1=$((a_wins_t1 + 1)); else a_wins_t2=$((a_wins_t2 + 1)); fi

  drop_round
  rm -f "$TMPDIR"/r${r}_*.out
done

echo "INFO: barrier spread max ${max_spread}ms across $total_arrivals arrivals (threshold ${ARRIVAL_SPREAD_THRESHOLD_MS}ms)"
echo "INFO: scenario A winners: target1=$a_wins_t1 target2=$a_wins_t2"

if [ "$fail" = 0 ]; then
  echo "PASS: $ROUNDS rounds x 3 scenarios (A transfer vs transfer, B transfer vs registration, C raise vs registration vs cancel), no deadlock, no serialization failure, invariants held every round"
fi
exit "$fail"
