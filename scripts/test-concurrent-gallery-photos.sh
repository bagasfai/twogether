#!/usr/bin/env bash
# Proves the pending-photo cap in add_gallery_photo is concurrency-safe: one
# user firing many parallel uploads cannot exceed 20 pending photos per album.
# Requires a running local stack (npx supabase start).
set -euo pipefail

# Derive the URL from the CLI — never hardcode a port. Another Supabase stack
# on this machine owns 54322, and this script issues DELETEs.
DB_URL="${DB_URL:-$(npx --no-install supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')}"
[ -n "$DB_URL" ] || { echo "FAIL: could not determine DB_URL; is the stack running?"; exit 1; }

# Refuse to touch a database that is not this project's.
GUARD=$(psql "$DB_URL" -At -c \
  "select coalesce(to_regclass('public.gallery_photos') is not null
                   and to_regproc('public.add_gallery_photo') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL is not this project's database (no gallery_photos table / add_gallery_photo)."
  echo "      Refusing to run destructive statements against it."
  exit 1
}

RACERS=30
CAP=20
SESSION_ID="aaaaaaaa-0000-0000-0000-00000000f002"
GALLERY_ID="aaaaaaaa-0000-0000-0000-00000000f003"
# How tight the simultaneous-release barrier must be for the passing run to
# actually mean something. If this is ever flaky on slower hardware, raise it
# and say so in the report — do not delete the assertion.
ARRIVAL_SPREAD_THRESHOLD_MS="${ARRIVAL_SPREAD_THRESHOLD_MS:-50}"

TMPDIR=$(mktemp -d)

# The 'gallery' bucket may not exist yet (it is created by a later migration).
# storage.objects has an FK to it, so create it for the run if missing and
# remove it afterwards only if this script created it.
BUCKET_CREATED=$(psql "$DB_URL" -At -c \
  "with ins as (insert into storage.buckets (id, name) values ('gallery', 'gallery')
                on conflict (id) do nothing returning 1)
   select count(*) from ins")

# Runs on every exit path — pass, fail, or interrupt — so a failing run never
# leaves fixtures behind.
cleanup() {
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
begin;
delete from public.gallery_photos where gallery_id = '$GALLERY_ID';
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'gallery' and name like '$GALLERY_ID/%';
delete from public.galleries where id = '$GALLERY_ID';
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email in ('galleryracer@test.local', 'galleryracehost@test.local');
drop table if exists public._race_arrivals;
commit;
SQL
    if [ "${BUCKET_CREATED:-0}" = "1" ]; then
      psql "$DB_URL" -q >/dev/null 2>&1 -c "set storage.allow_delete_query = 'true'; delete from storage.buckets where id = 'gallery'" || true
    fi
  fi
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

# Pre-clean leftovers from a prior aborted run, then build fixtures.
psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
begin;
delete from public.gallery_photos where gallery_id = '$GALLERY_ID';
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'gallery' and name like '$GALLERY_ID/%';
delete from public.galleries where id = '$GALLERY_ID';
delete from public.sessions where id = '$SESSION_ID';
delete from auth.users where email in ('galleryracer@test.local', 'galleryracehost@test.local');
drop table if exists public._race_arrivals;
commit;
SQL

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values
  (gen_random_uuid(), 'galleryracer@test.local'),
  (gen_random_uuid(), 'galleryracehost@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, waitlist_capacity,
   created_by, status, registration_state)
values
  ('$SESSION_ID', 'Gallery Race Session',
   now() - interval '1 hour', now() + interval '1 hour',
   'GOR Jakbar', 10, 0,
   (select id from auth.users where email = 'galleryracehost@test.local'),
   'scheduled', 'open');

insert into public.galleries (id, title, session_id)
values ('$GALLERY_ID', 'Gallery Race Album', '$SESSION_ID');

-- Confirmed first, then checked in (participants_enforce_checkin).
insert into public.participants (session_id, user_id, status)
values ('$SESSION_ID', (select id from auth.users where email = 'galleryracer@test.local'), 'confirmed');
update public.participants set checked_in_at = now()
 where session_id = '$SESSION_ID';

-- One storage row per racer, owned by the racer, so every call passes the
-- path check and only the cap can reject it.
insert into storage.objects (bucket_id, name, owner, owner_id)
select 'gallery', '$GALLERY_ID/' || g || '.webp',
       u.id, u.id::text
  from generate_series(1, $RACERS) g,
       (select id from auth.users where email = 'galleryracer@test.local') u;

-- Scratch table so the barrier itself is assertable, not just assumed.
create table public._race_arrivals (worker int not null, arrived_at timestamptz not null);
SQL

USER_ID=$(psql "$DB_URL" -At -c "select id from auth.users where email = 'galleryracer@test.local'")

# Every racer waits for the same wall-clock instant, then fires.
START_EPOCH=$(psql "$DB_URL" -At -c "select extract(epoch from now() + interval '5 seconds')")

for n in $(seq 1 "$RACERS"); do
  (
    psql "$DB_URL" -q -At -v ON_ERROR_STOP=1 > "$TMPDIR/$n.out" 2>&1 <<SQL
\set VERBOSITY verbose
-- Autocommit, deliberately OUTSIDE the upload transaction below, so a
-- rejected worker still records its arrival.
select pg_sleep_until(to_timestamp($START_EPOCH));
insert into public._race_arrivals (worker, arrived_at) values ($n, clock_timestamp());
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$USER_ID","role":"authenticated"}';
select public.add_gallery_photo('$GALLERY_ID', '$GALLERY_ID/$n.webp', 'race $n');
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

# --- Per-worker outcome classification: a failure must be JB014 (cap). ---
OK_WORKERS=0
CAP_REJECTED=0
BAD_WORKERS=0
for f in "$TMPDIR"/*.out; do
  [ -e "$f" ] || continue
  if grep -q "^EXIT:0$" "$f"; then
    OK_WORKERS=$((OK_WORKERS + 1))
  elif grep -q "JB014" "$f"; then
    CAP_REJECTED=$((CAP_REJECTED + 1))
  else
    BAD_WORKERS=$((BAD_WORKERS + 1))
    echo "FAIL: worker $(basename "$f" .out) failed without JB014:"
    sed 's/^/  /' "$f"
  fi
done
[ "$BAD_WORKERS" = 0 ] || fail=1

PENDING=$(psql "$DB_URL" -At -c \
  "select count(*) from public.gallery_photos where gallery_id = '$GALLERY_ID' and uploaded_by = '$USER_ID' and status = 'pending'")
TOTAL=$(psql "$DB_URL" -At -c \
  "select count(*) from public.gallery_photos where gallery_id = '$GALLERY_ID'")

[ "$PENDING" = "$CAP" ] || { echo "FAIL: expected $CAP pending rows, got $PENDING"; fail=1; }
[ "$TOTAL" = "$CAP" ] || { echo "FAIL: expected $CAP total rows, got $TOTAL"; fail=1; }
[ "$OK_WORKERS" = "$CAP" ] || { echo "FAIL: expected $CAP successful workers, got $OK_WORKERS"; fail=1; }
[ "$CAP_REJECTED" = "$((RACERS - CAP))" ] || { echo "FAIL: expected $((RACERS - CAP)) JB014 rejections, got $CAP_REJECTED"; fail=1; }

if [ "$fail" = 0 ]; then
  echo "PASS: $RACERS racers, $PENDING pending, $CAP_REJECTED rejected with JB014, barrier spread ${SPREAD_MS}ms"
fi
exit "$fail"
