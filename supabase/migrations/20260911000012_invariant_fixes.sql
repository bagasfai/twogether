-- Final whole-branch review fixes (F1, F2, F3+F4). All 11 prior migrations
-- are reviewed and closed; this is the only new migration for that review.

-- ---------------------------------------------------------------------------
-- F1: no database invariant ties checked_in_at to status. Four RPCs null
-- checked_in_at by hand on cancellation, but check-in is specified as a
-- plain host UPDATE and participants_update_host is column- and
-- status-unrestricted -- so a host direct-UPDATE cancellation (which does
-- fire promotion) can leave checked_in_at set, and a host can check in an
-- already-cancelled participant. guard_match_player then admits them to a
-- match, breaking the rule that checked-in players are a distinct pool from
-- registered participants. Enforce it at the row level instead of trusting
-- every writer to remember.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_checkin_requires_active()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    new.checked_in_at := null;
  end if;
  return new;
end;
$$;

-- Makes the RPCs' manual `checked_in_at = null` clearing redundant but
-- harmless -- the RPCs are reviewed and closed and are left alone.
drop trigger if exists participants_enforce_checkin on public.participants;
create trigger participants_enforce_checkin
before insert or update on public.participants
for each row execute function public.enforce_checkin_requires_active();

-- ---------------------------------------------------------------------------
-- F2: announcements_select (migration 9) is `to anon, authenticated` and its
-- third disjunct calls public.is_admin(). Migration 2 did
-- `revoke ... from public; grant ... to authenticated`, which does not strip
-- Supabase's default EXECUTE grant to anon on newly created functions -- so
-- every anonymous read of announcements has been executing a SECURITY
-- DEFINER function anon was never deliberately granted. Make the dependency
-- explicit rather than continuing to rely on an accidental default grant,
-- which is also what makes the obvious future hardening step (revoking
-- is_admin from anon) safe to do without silently breaking anonymous
-- announcement reads with 42501.
-- ---------------------------------------------------------------------------

grant execute on function public.is_admin() to anon;

-- current_user_role() is checked against both policy migrations (8 and 9):
-- its only use is sessions_insert_host in migration 8
-- (`for insert to authenticated`), which anon cannot even reach as a role,
-- let alone through any policy disjunct. Migration 9 does not reference it
-- at all. It is therefore safe to revoke anon's (also accidental) default
-- grant -- no anon-reachable policy depends on it.
revoke execute on function public.current_user_role() from anon;

-- ---------------------------------------------------------------------------
-- F3 + F4: promotion must fire however a confirmed slot is freed, not only
-- on member/host cancellation via UPDATE. Two gaps: a host DELETEing a
-- confirmed participant frees a slot and promotes nobody, and
-- host_set_participant_status demoting confirmed -> waiting_list does the
-- same.
-- ---------------------------------------------------------------------------

-- Widen the UPDATE trigger's WHEN so demotion also promotes. Recursion
-- guard: the promotion UPDATE inside promote_from_waitlist sets
-- status = 'confirmed' on a row whose OLD status is 'waiting_list' --
-- old.status = 'confirmed' is false for that write regardless of what
-- new.status is, so the widened WHEN (old.status = 'confirmed' and
-- new.status is distinct from 'confirmed') still cannot re-fire from
-- promotion's own write. It only newly fires for old.status = 'confirmed'
-- transitions other than to 'cancelled' -- i.e. the demotion-to-waiting_list
-- case this fix targets.
drop trigger if exists participants_promote_waitlist on public.participants;
create trigger participants_promote_waitlist
after update on public.participants
for each row
when (old.status = 'confirmed' and new.status is distinct from 'confirmed')
execute function public.promote_from_waitlist();

-- DELETE has no NEW row, so promote_from_waitlist (which reads new.*)
-- cannot be reused directly. This variant is identical except it reads
-- old.session_id and old.status, and is registered on AFTER DELETE only.
create or replace function public.promote_from_waitlist_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions;
  v_confirmed int;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'promote_from_waitlist_on_delete requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(old.session_id));

  select * into v_session from public.sessions where id = old.session_id;

  if v_session.status not in ('scheduled', 'live') then
    return null;
  end if;

  select count(*) into v_confirmed
    from public.participants
   where session_id = old.session_id and status = 'confirmed';

  if v_confirmed < v_session.max_participants then
    update public.participants
       set status = 'confirmed'
     where id = (
       select id from public.participants
        where session_id = old.session_id
          and status = 'waiting_list'
        order by registered_at, id
        limit 1
     );
  end if;

  return null;
end;
$$;

drop trigger if exists participants_promote_waitlist_on_delete on public.participants;
create trigger participants_promote_waitlist_on_delete
after delete on public.participants
for each row
when (old.status = 'confirmed')
execute function public.promote_from_waitlist_on_delete();
