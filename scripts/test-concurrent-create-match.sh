#!/usr/bin/env bash
# Proves two hosts confirming overlapping suggestions cannot double-book a
# player: create_match locks participants in id order (no deadlock) and
# guard_match_player raises JB017 for the loser (no player in two active matches).
# Each round is its own session; the two racers name overlapping players in
# crossed order (P1,P2 v P3,P4 against P4,P5 v P6,P1), the shape that deadlocks
# without the ordered lock. Requires a running local stack (npx supabase start).
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
  "select coalesce(to_regclass('public.match_players') is not null
                   and to_regproc('public.create_match') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL is not this project's database (no match_players table / create_match)."
  echo "      Refusing to run destructive statements against it."
  exit 1
}

ROUNDS="${ROUNDS:-20}"
# If this is flaky on slower hardware, raise it and say so in the report; do
# not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS="${ARRIVAL_SPREAD_THRESHOLD_MS:-100}"
HOST_ID="22222222-2222-4222-8222-0000000000ff"

TMPDIR=$(mktemp -d)

# Ids are derived from the round number so cleanup and the workers agree.
sid() { printf 'aaaaaaaa-0000-4000-8000-%012d' "$1"; }
cid() { printf 'bbbbbbbb-0000-4000-8000-%012d' "$(( $1 * 10 + $2 ))"; }
pid() { printf 'dddddddd-0000-4000-8000-%012d' "$(( $1 * 10 + $2 ))"; }

cleanup() {
  psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
-- guard_court_delete blocks deleting a session with scheduled matches.
update public.matches set status = 'cancelled'
 where status in ('scheduled', 'in_progress')
   and session_id in (select id from public.sessions where title = 'Match Race');
delete from public.sessions where title = 'Match Race';
delete from auth.users where email like 'matchrace%@test.local';
drop table if exists public._match_race_arrivals;
SQL
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
-- guard_court_delete blocks deleting a session with scheduled matches.
update public.matches set status = 'cancelled'
 where status in ('scheduled', 'in_progress')
   and session_id in (select id from public.sessions where title = 'Match Race');
delete from public.sessions where title = 'Match Race';
delete from auth.users where email like 'matchrace%@test.local';
drop table if exists public._match_race_arrivals;

insert into auth.users (id, email) values ('$HOST_ID', 'matchracehost@test.local');

insert into auth.users (id, email)
select ('11111111-0000-4000-8000-' || lpad((r * 10 + s)::text, 12, '0'))::uuid,
       'matchrace' || r || '-' || s || '@test.local'
  from generate_series(1, $ROUNDS) r, generate_series(1, 6) s;

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status, registration_state)
select ('aaaaaaaa-0000-4000-8000-' || lpad(r::text, 12, '0'))::uuid, 'Match Race',
       now() + interval '1 day', now() + interval '1 day 2 hours',
       'GOR Jakbar', 16, '$HOST_ID', 'scheduled', 'open'
  from generate_series(1, $ROUNDS) r;

insert into public.courts (id, session_id, court_number)
select ('bbbbbbbb-0000-4000-8000-' || lpad((r * 10 + c)::text, 12, '0'))::uuid,
       ('aaaaaaaa-0000-4000-8000-' || lpad(r::text, 12, '0'))::uuid, c
  from generate_series(1, $ROUNDS) r, generate_series(1, 2) c;

insert into public.participants (id, session_id, user_id, status, checked_in_at)
select ('dddddddd-0000-4000-8000-' || lpad((r * 10 + s)::text, 12, '0'))::uuid,
       ('aaaaaaaa-0000-4000-8000-' || lpad(r::text, 12, '0'))::uuid,
       ('11111111-0000-4000-8000-' || lpad((r * 10 + s)::text, 12, '0'))::uuid,
       'confirmed', now()
  from generate_series(1, $ROUNDS) r, generate_series(1, 6) s;

-- Autocommit arrivals so the barrier is assertable (see the registration script).
create table public._match_race_arrivals (worker text not null, arrived_at timestamptz not null);
SQL

START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '6 seconds')")

# worker <round> <label> <court 1|2> <team1 slots> <team2 slots>
worker() {
  local r=$1 label=$2 court=$3 t1a=$4 t1b=$5 t2a=$6 t2b=$7 rc=0
  psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$TMPDIR/r${r}_${label}.out" 2>&1 <<SQL || rc=$?
\set VERBOSITY verbose
select pg_sleep_until(to_timestamp($START_EPOCH));
insert into public._match_race_arrivals (worker, arrived_at) values ('r${r}_${label}', clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$HOST_ID","role":"authenticated"}';
select public.create_match('$(sid "$r")', '$(cid "$r" "$court")',
  array['$(pid "$r" "$t1a")','$(pid "$r" "$t1b")']::uuid[],
  array['$(pid "$r" "$t2a")','$(pid "$r" "$t2b")']::uuid[]);
commit;
SQL
  echo "EXIT:$rc" >> "$TMPDIR/r${r}_${label}.out"
}

for r in $(seq 1 "$ROUNDS"); do
  worker "$r" A 1 1 2 3 4 &
  worker "$r" B 2 4 5 6 1 &
done
wait

fail=0

ARRIVALS=$(psql "$DB_URL" -At -c "select count(*) from public._match_race_arrivals")
[ "$ARRIVALS" = "$((ROUNDS * 2))" ] || {
  echo "FAIL: expected $((ROUNDS * 2)) arrivals at the barrier, got $ARRIVALS"
  fail=1
}

SPREAD_MS=$(psql "$DB_URL" -At -c \
  "select coalesce(round(extract(epoch from (max(arrived_at) - min(arrived_at))) * 1000)::int, -1) from public._match_race_arrivals")
echo "INFO: barrier spread across $ARRIVALS arrivals: ${SPREAD_MS}ms (threshold ${ARRIVAL_SPREAD_THRESHOLD_MS}ms)"
if [ "$SPREAD_MS" -lt 0 ] || [ "$SPREAD_MS" -ge "$ARRIVAL_SPREAD_THRESHOLD_MS" ]; then
  echo "FAIL: barrier spread ${SPREAD_MS}ms >= ${ARRIVAL_SPREAD_THRESHOLD_MS}ms; workers were not released simultaneously"
  fail=1
fi

# Per round: exactly one racer wins, the other fails with JB017 and nothing
# else. A deadlock (40P01) or any other error is a failure.
for r in $(seq 1 "$ROUNDS"); do
  wins=0 busy=0
  for label in A B; do
    f="$TMPDIR/r${r}_${label}.out"
    if grep -q "^EXIT:0$" "$f"; then
      wins=$((wins + 1))
    elif grep -q "JB017" "$f"; then
      busy=$((busy + 1))
    else
      echo "FAIL: round $r worker $label failed without JB017:"
      sed 's/^/  /' "$f"
      fail=1
    fi
  done
  [ "$wins" = 1 ] && [ "$busy" = 1 ] || {
    echo "FAIL: round $r expected 1 win + 1 JB017, got $wins win(s) + $busy JB017"
    fail=1
  }
done

# Final state, regardless of what the workers reported.
ACTIVE=$(psql "$DB_URL" -At -c \
  "select count(*) from public.matches m join public.sessions s on s.id = m.session_id
    where s.title = 'Match Race' and m.status = 'scheduled'")
[ "$ACTIVE" = "$ROUNDS" ] || { echo "FAIL: expected $ROUNDS scheduled matches, got $ACTIVE"; fail=1; }

DOUBLE=$(psql "$DB_URL" -At -c \
  "select count(*) from (
     select mp.participant_id
       from public.match_players mp
       join public.matches m on m.id = mp.match_id
       join public.sessions s on s.id = m.session_id
      where s.title = 'Match Race' and m.status in ('scheduled', 'in_progress')
      group by mp.participant_id having count(*) > 1) d")
[ "$DOUBLE" = 0 ] || { echo "FAIL: $DOUBLE player(s) sit in more than one active match"; fail=1; }

if [ "$fail" = 0 ]; then
  echo "PASS: $ROUNDS rounds, each 1 match created + 1 JB017, no deadlock, no double-booked player, barrier spread ${SPREAD_MS}ms"
fi
exit "$fail"
