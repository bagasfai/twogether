#!/usr/bin/env bash
# Self-test for the CI helper scripts: the send-email hook rewrite touches only
# its own block, and the env writer fails instead of writing empty values.
# Runs against copies in a temp dir; needs no Supabase stack.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

hook_only_block_changes() {
  local toml="$work/config.toml"
  cp "$root/supabase/config.toml" "$toml"
  "$here/disable-send-email-hook.sh" "$toml" || fail "hook_only_block_changes: script exited non-zero"
  local changed
  changed="$(diff "$root/supabase/config.toml" "$toml" | grep -c '^>' || true)"
  [ "$changed" = "1" ] || fail "hook_only_block_changes: expected 1 changed line, got $changed"
  local line
  line="$(awk '/^\[/{inside=($0=="[auth.hook.send_email]")} inside && /^enabled[[:space:]]*=/{print; exit}' "$toml")"
  [ "$line" = "enabled = false" ] || fail "hook_only_block_changes: block reads '$line'"
  echo "PASS: hook_only_block_changes"
}

hook_missing_block_fails() {
  local toml="$work/no-hook.toml"
  printf '[auth]\nenabled = true\n\n[auth.hook.custom_access_token]\nenabled = true\n' > "$toml"
  if "$here/disable-send-email-hook.sh" "$toml" 2>/dev/null; then
    fail "hook_missing_block_fails: script exited 0"
  fi
  echo "PASS: hook_missing_block_fails"
}

env_writes_all_keys() {
  local status="$work/status-ok.env" out="$work/env-ok"
  printf 'API_URL="http://127.0.0.1:54331"\nANON_KEY="anon"\nSERVICE_ROLE_KEY="svc"\nDB_URL="postgresql://x"\n' > "$status"
  SUPABASE_STATUS_ENV="$status" "$here/write-env-local.sh" "$out" || fail "env_writes_all_keys: script exited non-zero"
  [ -f "$out" ] || fail "env_writes_all_keys: no output file"
  local expected
  expected="$(printf '%s\n' \
    'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331' \
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=anon' \
    'SUPABASE_SERVICE_ROLE_KEY=svc' \
    'NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000' \
    'INQUIRY_IP_SALT=ci-not-secret')"
  [ "$(cat "$out")" = "$expected" ] || fail "env_writes_all_keys: output differs: $(cat "$out")"
  echo "PASS: env_writes_all_keys"
}

env_missing_key_fails() {
  local status="$work/status-missing.env" out="$work/env-missing"
  printf 'API_URL="http://127.0.0.1:54331"\nANON_KEY="anon"\n' > "$status"
  if SUPABASE_STATUS_ENV="$status" "$here/write-env-local.sh" "$out" 2>/dev/null; then
    fail "env_missing_key_fails: script exited 0"
  fi
  [ ! -e "$out" ] || fail "env_missing_key_fails: output file was created"
  echo "PASS: env_missing_key_fails"
}

hook_only_block_changes
hook_missing_block_fails
env_writes_all_keys
env_missing_key_fails
