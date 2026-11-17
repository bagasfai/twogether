#!/usr/bin/env bash
# Writes the e2e env file from the running local Supabase stack. Fails, writing
# nothing, if `supabase status -o env` lacks any key the e2e suite needs.
# SUPABASE_STATUS_ENV (a file path) replaces the status call, for tests.
set -euo pipefail

out="${1:?usage: write-env-local.sh <out-path>}"

if [ -n "${SUPABASE_STATUS_ENV:-}" ]; then
  status="$(cat "$SUPABASE_STATUS_ENV")"
else
  status="$(npx --no-install supabase status -o env)"
fi

read_key() {
  printf '%s\n' "$status" | sed -n "s/^$1=\"\(.*\)\"$/\1/p" | head -n 1
}

api_url="$(read_key API_URL)"
anon_key="$(read_key ANON_KEY)"
service_role_key="$(read_key SERVICE_ROLE_KEY)"

missing=()
[ -n "$api_url" ] || missing+=(API_URL)
[ -n "$anon_key" ] || missing+=(ANON_KEY)
[ -n "$service_role_key" ] || missing+=(SERVICE_ROLE_KEY)
if [ "${#missing[@]}" -gt 0 ]; then
  echo "write-env-local: supabase status is missing ${missing[*]}" >&2
  exit 1
fi

printf '%s\n' \
  "NEXT_PUBLIC_SUPABASE_URL=$api_url" \
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon_key" \
  "SUPABASE_SERVICE_ROLE_KEY=$service_role_key" \
  "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000" \
  "INQUIRY_IP_SALT=ci-not-secret" > "$out"
