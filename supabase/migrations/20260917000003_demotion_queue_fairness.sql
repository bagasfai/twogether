-- core-schema-follow-ups.md, "Should fix soon": "A demoted participant keeps
-- their original registered_at, so they rejoin the queue ahead of people who
-- have waited longer." host_set_participant_status (0010/0012/0015) demotes
-- confirmed -> waiting_list without touching registered_at, so a participant
-- who registered first but gets bumped for a later, non-registration reason
-- (host correction, no-show handling, etc.) keeps their original spot at the
-- front of promote_from_waitlist's `order by registered_at, id` -- ahead of
-- everyone who has been on the waitlist the whole time. Re-stamp
-- registered_at to now() on the transition into waiting_list so a demoted
-- participant re-enters at the back, same as anyone else joining the
-- waitlist now. Only fires on entry into waiting_list (old status distinct
-- from it), so re-issuing the same status is a no-op and doesn't bump
-- someone already fairly queued.
create or replace function public.host_set_participant_status(
  p_participant_id uuid,
  p_status public.participant_status
)
returns public.participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_old_status public.participant_status;
  v_row public.participants;
begin
  select session_id, status into v_session_id, v_old_status
    from public.participants where id = p_participant_id;

  if v_session_id is null then
    raise exception 'participant not found' using errcode = 'JB008';
  end if;

  if not public.is_session_host(v_session_id) then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  update public.participants
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else null end,
         -- a host-cancelled participant leaves the checked-in pool too
         checked_in_at = case when p_status = 'cancelled' then null else checked_in_at end,
         registered_at = case
           when p_status = 'waiting_list' and v_old_status is distinct from 'waiting_list'
             then now()
           else registered_at
         end
   where id = p_participant_id
  returning * into v_row;

  return v_row;
end;
$$;
