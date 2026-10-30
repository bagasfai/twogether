-- core-schema-follow-ups.md, "Should fix soon": participants_update_host is
-- column-unrestricted. RLS policies gate which ROWS an UPDATE can touch,
-- not which COLUMNS -- so a host, permitted a plain client UPDATE for the
-- check-in toggle (see setCheckedIn's comment in lib/actions/participants.ts),
-- could also rewrite registered_at (waitlist order) or added_by (the
-- over-capacity audit trail) in that same UPDATE, silently corrupting data
-- the registration/waitlist system depends on for fairness and auditing.
--
-- Every status transition already goes through a SECURITY DEFINER RPC
-- (host_set_participant_status, host_add_participant, register_for_session,
-- add_guest_participant, cancel_registration, member_confirm_participation)
-- -- those run with the function owner's privileges, so a column-level
-- grant on the calling role does not affect them. The only thing a plain
-- client UPDATE on participants is meant to do is flip checked_in_at.
-- Column-level privilege is the right enforcement layer here, the same way
-- RLS is the right layer for rows (CLAUDE.md §3 rule 2).
revoke update on public.participants from authenticated;
grant update (checked_in_at) on public.participants to authenticated;
