#!/usr/bin/env bash
# Proves the FAQ ordering RPCs are concurrency-safe: many admins creating and
# moving FAQ items at the same instant leave sort_order unique and gapless
# (1..n). Without the advisory lock in faq_create/faq_move this fails with
# unique violations or lost swaps. Requires a running local stack
# (npx supabase start).
set -euo pipefail

# Derive the URL from the CLI — never hardcode a port. Another Supabase stack
# on this machine owns 54322, and this script issues DELETEs.
DB_URL="${DB_URL:-$(npx --no-install supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')}"
[ -n "$DB_URL" ] || { echo "FAIL: could not determine DB_URL; is the stack running?"; exit 1; }

# Refuse to touch a database that is not this project's.
GUARD=$(psql "$DB_URL" -At -c \
  "select coalesce(to_regclass('public.faq_items') is not null
                   and to_regproc('public.faq_move') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL is not this project's database (no faq_items table / faq_move)."
  echo "      Refusing to run destructive statements against it."
  exit 1
}

# The run reorders the whole table, so refuse to run over real content.
FOREIGN=$(psql "$DB_URL" -At -c \
  "select count(*) from public.faq_items where question_en not like 'race %'")
[ "$FOREIGN" = "0" ] || {
  echo "FAIL: faq_items holds $FOREIGN non-fixture rows; refusing to reorder real content."
  exit 1
}

RACERS="${RACERS:-40}"
SEEDED=5
ADMIN_EMAIL="faqracer@test.local"
# How tight the simultaneous-release barrier must be for the passing run to
# actually mean something. If this is ever flaky on slower hardware, raise it
# and say so in the report — do not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS="${ARRIVAL_SPREAD_THRESHOLD_MS:-50}"

TMPDIR=$(mktemp -d)

# Runs on every exit path — pass, fail, or interrupt — so a failing run never
# leaves fixtures behind.
cleanup() {
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
begin;
delete from public.faq_items where question_en like 'race %';
delete from auth.users where email = '$ADMIN_EMAIL';
drop table if exists public._race_arrivals;
commit;
SQL
  fi
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

# Pre-clean leftovers from a prior aborted run, then build fixtures.
psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
begin;
delete from public.faq_items where question_en like 'race %';
delete from auth.users where email = '$ADMIN_EMAIL';
drop table if exists public._race_arrivals;
commit;
SQL

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values (gen_random_uuid(), '$ADMIN_EMAIL');
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = '$ADMIN_EMAIL');

insert into public.faq_items
  (question_en, question_id, answer_en, answer_id, sort_order)
select 'race seed ' || g, 'race seed ' || g, 'a', 'a', g
  from generate_series(1, $SEEDED) g;

-- Scratch table so the barrier itself is assertable, not just assumed.
create table public._race_arrivals (worker int not null, arrived_at timestamptz not null);
SQL

ADMIN_ID=$(psql "$DB_URL" -At -c "select id from auth.users where email = '$ADMIN_EMAIL'")
SEED_IDS=($(psql "$DB_URL" -At -c "select id from public.faq_items order by sort_order"))

# Every racer waits for the same wall-clock instant, then fires.
START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '5 seconds')")

CREATES=0
for n in $(seq 1 "$RACERS"); do
  # Odd workers append, even workers move a random seeded row a random way.
  if [ $((n % 2)) -eq 1 ]; then
    CALL="select public.faq_create('race $n', 'race $n', 'a', 'a');"
    CREATES=$((CREATES + 1))
  else
    ID="${SEED_IDS[$((RANDOM % SEEDED))]}"
    if [ $((RANDOM % 2)) -eq 0 ]; then DIR=up; else DIR=down; fi
    CALL="select public.faq_move('$ID', '$DIR');"
  fi
  (
    psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$TMPDIR/$n.out" 2>&1 <<SQL
\set VERBOSITY verbose
-- Autocommit, deliberately OUTSIDE the transaction below, so a rejected
-- worker still records its arrival.
select pg_sleep_until(to_timestamp($START_EPOCH));
insert into public._race_arrivals (worker, arrived_at) values ($n, clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$ADMIN_ID","role":"authenticated"}';
$CALL
commit;
SQL
    echo "EXIT:$?" >> "$TMPDIR/$n.out"
  ) &
done
wait

fail=0

# --- Barrier assertions ---
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

# --- Per-worker outcomes: every worker must succeed. ---
OK_WORKERS=0
BAD_WORKERS=0
for f in "$TMPDIR"/*.out; do
  [ -e "$f" ] || continue
  if grep -q "^EXIT:0$" "$f"; then
    OK_WORKERS=$((OK_WORKERS + 1))
  else
    BAD_WORKERS=$((BAD_WORKERS + 1))
    echo "FAIL: worker $(basename "$f" .out) did not succeed:"
    sed 's/^/  /' "$f"
  fi
done
[ "$BAD_WORKERS" = 0 ] || fail=1

# --- Final-state invariants ---
read -r TOTAL DISTINCT MIN_ORDER MAX_ORDER < <(psql "$DB_URL" -At -F ' ' -c \
  "select count(*), count(distinct sort_order), coalesce(min(sort_order), 0), coalesce(max(sort_order), 0) from public.faq_items")
EXPECTED=$((SEEDED + CREATES))

[ "$TOTAL" = "$EXPECTED" ] || { echo "FAIL: expected $EXPECTED rows, got $TOTAL"; fail=1; }
[ "$TOTAL" = "$DISTINCT" ] || { echo "FAIL: $TOTAL rows but only $DISTINCT distinct sort_order values"; fail=1; }
[ "$MIN_ORDER" = "1" ] || { echo "FAIL: min(sort_order) is $MIN_ORDER, expected 1"; fail=1; }
[ "$MAX_ORDER" = "$TOTAL" ] || { echo "FAIL: max(sort_order) is $MAX_ORDER, expected $TOTAL (gap)"; fail=1; }

if [ "$fail" = 0 ]; then
  echo "PASS: $RACERS racers ($CREATES creates, $((RACERS - CREATES)) moves), $TOTAL rows gapless 1..$MAX_ORDER, barrier spread ${SPREAD_MS}ms"
fi
exit "$fail"
