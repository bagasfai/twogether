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
-- sessions first: created_by references profiles, which cascades from
-- auth.users, so deleting auth.users first would leave a leftover session
-- (from a prior run) blocking the profile delete via that FK.
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email like 'race%@test.local';

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

# Leftover race fixtures (a scheduled session + confirmed/waitlisted rows)
# otherwise sit in the local DB and skew unrelated pgTAP session-visibility
# counts (e.g. 008_rls_core.test.sql) the next time `supabase test db` runs.
# Best-effort: don't let cleanup failures mask the real pass/fail result above.
psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email like 'race%@test.local';
SQL

exit "$fail"
