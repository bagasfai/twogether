-- WhatsApp share text includes an optional per-session fee (see
-- docs/superpowers/specs/2026-09-17-whatsapp-share-operational-dashboard-design.md).
-- Nullable and integer: Rupiah has no subunit in casual use, and a session
-- with no price set should omit the fee line entirely rather than show 0.
alter table public.sessions
  add column price integer check (price >= 0);
