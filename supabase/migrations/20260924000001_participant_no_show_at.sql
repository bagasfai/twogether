-- Manual no-show marker for a session's roster after it's closed. Mirrors
-- paid_at exactly (20260917000006): a nullable timestamp, not a boolean,
-- toggled by a direct column-level grant rather than a SECURITY DEFINER RPC.
-- Safe for the same reason paid_at is: participants_update_host RLS already
-- scopes the row to hosts of that session, and marking someone a no-show
-- isn't a capacity-racing decision the way registration status is (CLAUDE.md
-- Sec 3 rule 1 only requires the RPC/trigger treatment for registration and
-- waitlist promotion). Deliberately independent of checked_in_at -- a host
-- can correct either field regardless of the other (manual override, not a
-- validity constraint).
alter table public.participants
  add column no_show_at timestamptz;

grant update (no_show_at) on public.participants to authenticated;
