#!/usr/bin/env bash
# Proves public.public_community_stats() counts what the landing page claims,
# is callable by anon without opening profiles to anon, and is pinned down
# (stable, security definer, fixed search_path). Counts are asserted as deltas
# against a baseline taken before the fixtures, since the DB may hold other
# rows. Requires a running local stack (npx supabase start).
set -euo pipefail

# Derive the URL from the CLI — never hardcode a port. Another Supabase stack
# on this machine owns 54322, and this script issues DELETEs.
DB_URL="${DB_URL:-$(npx --no-install supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')}"
[ -n "$DB_URL" ] || { echo "FAIL: could not determine DB_URL; is the stack running?"; exit 1; }

# Refuse to touch a database that is not this project's.
GUARD=$(psql "$DB_URL" -At -c \
  "select coalesce(to_regproc('public.public_community_stats') is not null
                   and to_regclass('public.participants') is not null, false)")
[ "$GUARD" = "t" ] || {
  echo "FAIL: $DB_URL has no public.public_community_stats() / public.participants."
  echo "      Apply the migration (npx supabase db reset) or point at this project's stack."
  exit 1
}

EMAIL_SUFFIX="@pcs.test.local"
TITLE_PREFIX="pcs fixture "

# Runs on every exit path so a failing run never leaves fixtures behind.
cleanup() {
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -q >/dev/null 2>&1 <<SQL || true
begin;
delete from public.sessions where title like '${TITLE_PREFIX}%';
delete from auth.users where email like '%${EMAIL_SUFFIX}';
commit;
SQL
  fi
}
trap cleanup EXIT

# Pre-clean leftovers from a prior aborted run.
cleanup

STATS_SQL="select sessions_held, matches_played, total_checkins, active_members from public.public_community_stats()"

read -r B_SESSIONS B_MATCHES B_CHECKINS B_ACTIVE < <(psql "$DB_URL" -At -F ' ' -c "$STATS_SQL")

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values
  (gen_random_uuid(), 'a${EMAIL_SUFFIX}'),
  (gen_random_uuid(), 'b${EMAIL_SUFFIX}'),
  (gen_random_uuid(), 'c${EMAIL_SUFFIX}');

insert into public.sessions
  (title, starts_at, ends_at, location, max_participants, status, created_by)
select '${TITLE_PREFIX}' || s.n, now() - interval '1 day', now() - interval '23 hours',
       'pcs', 10, s.status::public.session_status,
       (select id from auth.users where email = 'a${EMAIL_SUFFIX}')
  from (values (1, 'completed'), (2, 'scheduled'), (3, 'completed')) as s(n, status);

-- Two completed matches and one scheduled one, across the fixture sessions.
insert into public.matches (session_id, status)
select id, m.status::public.match_status
  from public.sessions
  join (values (1, 'completed'), (1, 'completed'), (2, 'scheduled')) as m(n, status)
    on title = '${TITLE_PREFIX}' || m.n;

-- A: checked in to two sessions, both recent -> 2 check-ins, 1 active member.
-- B: checked in 91 days ago -> 1 check-in, not active.
-- C: registered, never checked in -> neither.
insert into public.participants (session_id, user_id, status, checked_in_at)
select s.id, u.id, 'confirmed', c.checked_in_at
  from (values
    ('${TITLE_PREFIX}1', 'a${EMAIL_SUFFIX}', now() - interval '1 day'),
    ('${TITLE_PREFIX}3', 'a${EMAIL_SUFFIX}', now() - interval '2 days'),
    ('${TITLE_PREFIX}1', 'b${EMAIL_SUFFIX}', now() - interval '91 days'),
    ('${TITLE_PREFIX}1', 'c${EMAIL_SUFFIX}', null::timestamptz)
  ) as c(title, email, checked_in_at)
  join public.sessions s on s.title = c.title
  join auth.users u on u.email = c.email;
SQL

read -r A_SESSIONS A_MATCHES A_CHECKINS A_ACTIVE < <(psql "$DB_URL" -At -F ' ' -c "$STATS_SQL")

fail=0
expect() { # name, actual delta, expected delta
  if [ "$2" != "$3" ]; then
    echo "FAIL: $1 delta is $2, expected $3"
    fail=1
  fi
}
expect sessions_held   $((A_SESSIONS - B_SESSIONS)) 2
expect matches_played  $((A_MATCHES - B_MATCHES)) 2
expect total_checkins  $((A_CHECKINS - B_CHECKINS)) 3
expect active_members  $((A_ACTIVE - B_ACTIVE)) 1

# anon can call it ...
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -q -At >/dev/null 2>"${TMPDIR:-/tmp}/pcs-anon.err" <<SQL
begin;
set local role anon;
$STATS_SQL;
commit;
SQL
then
  echo "FAIL: anon could not call public_community_stats():"
  sed 's/^/  /' "${TMPDIR:-/tmp}/pcs-anon.err"
  fail=1
fi

# ... but still cannot read profiles.
PROFILES_ERR=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -At 2>&1 <<SQL || true
begin;
set local role anon;
select count(*) from public.profiles;
commit;
SQL
)
case "$PROFILES_ERR" in
  *"permission denied"*) ;;
  *) echo "FAIL: anon select on profiles should be permission denied, got: $PROFILES_ERR"; fail=1 ;;
esac
rm -f "${TMPDIR:-/tmp}/pcs-anon.err"

# Function attributes: security definer, stable, search_path pinned.
read -r DEFINER VOLATILE PINNED < <(psql "$DB_URL" -At -F ' ' -c \
  "select prosecdef, provolatile, coalesce(array_to_string(proconfig, ',') like '%search_path=%', false)
     from pg_proc where oid = 'public.public_community_stats'::regproc")
[ "$DEFINER" = "t" ] || { echo "FAIL: not security definer"; fail=1; }
[ "$VOLATILE" = "s" ] || { echo "FAIL: provolatile is $VOLATILE, expected s (stable)"; fail=1; }
[ "$PINNED" = "t" ] || { echo "FAIL: search_path is not pinned in proconfig"; fail=1; }

if [ "$fail" = 0 ]; then
  echo "PASS: sessions +2, matches +2, check-ins +3, active members +1; anon ok, profiles closed, definer/stable/search_path pinned"
fi
exit "$fail"
