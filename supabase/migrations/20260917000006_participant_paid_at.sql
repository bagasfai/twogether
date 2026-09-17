-- Manual payment-status marker for the WhatsApp share text's checkmark (see
-- docs/superpowers/specs/2026-09-17-whatsapp-share-operational-dashboard-design.md).
-- Mirrors the checked_in_at column exactly -- a nullable timestamp, not a
-- boolean/enum, toggled by a direct column-level grant rather than a
-- SECURITY DEFINER RPC. Safe for the same reason checked_in_at is:
-- participants_update_host RLS already scopes the row to hosts of that
-- session, and marking someone paid isn't a capacity-racing decision the
-- way registration status is (CLAUDE.md Sec 3 rule 1 only requires the
-- RPC/trigger treatment for registration and waitlist promotion).
alter table public.participants
  add column paid_at timestamptz;

grant update (paid_at) on public.participants to authenticated;
