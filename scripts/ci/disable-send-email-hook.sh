#!/usr/bin/env bash
# Turns off the send-email auth hook in the given supabase config.toml (CI only),
# so Auth falls back to its built-in mailer instead of calling Resend.
# Rewrites only the `enabled = true` line inside [auth.hook.send_email].
set -euo pipefail

toml="${1:?usage: disable-send-email-hook.sh <config.toml>}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

awk '
  /^\[/ { inside = ($0 == "[auth.hook.send_email]") }
  inside && !done && /^enabled[[:space:]]*=[[:space:]]*true[[:space:]]*$/ {
    print "enabled = false"
    done = 1
    next
  }
  { print }
  END { if (!done) exit 1 }
' "$toml" > "$tmp" || {
  echo "disable-send-email-hook: no 'enabled = true' under [auth.hook.send_email] in $toml" >&2
  exit 1
}

cat "$tmp" > "$toml"
