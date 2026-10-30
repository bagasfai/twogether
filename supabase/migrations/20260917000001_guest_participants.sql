-- A member registering for a session may also bring people who have no
-- account (friends/partners). Model that as a participant row with no
-- user_id -- a "guest" row -- attributed to the member who registered it via
-- registered_by. Guests never get their own login, so there is no
-- profiles/profiles_private row to join for their name/phone: those live
-- directly on the participant row instead.
--
-- guest_phone is nullable: unlike a member's own account (see the signup
-- migration), a phone number for someone else's guest is a courtesy, not
-- something the app can force a third party to hand over.

alter table public.participants
  alter column user_id drop not null,
  add column guest_name text,
  add column guest_phone text,
  add column registered_by uuid references public.profiles (id);

alter table public.participants
  add constraint participants_member_xor_guest check (
    (user_id is not null and guest_name is null)
    or (user_id is null and guest_name is not null)
  );

-- Backfill: every existing row is a member row, already satisfies the
-- constraint above with guest_name null, nothing to do.

-- A guest row has no account of its own to see it, so the registering
-- member needs the same visibility over it that user_id = auth.uid() gives a
-- member over their own row.
drop policy participants_select_self_host_or_public on public.participants;

create policy participants_select_self_host_or_public on public.participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or registered_by = auth.uid()
    or public.is_session_host(session_id)
    or (status <> 'cancelled' and public.session_is_public(session_id))
  );

-- Mirrors register_for_session, for a guest the caller is vouching for
-- instead of themselves. Same lock, same capacity re-read, same isolation
-- guard -- a guest registration and a self-registration for the same
-- session must serialize against each other identically.
create or replace function public.register_guest_for_session(
  p_session_id uuid,
  p_guest_name text,
  p_guest_phone text default null
)
returns public.registration_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.sessions;
  v_confirmed int;
  v_waiting int;
  v_status public.participant_status;
  v_registered_at timestamptz := clock_timestamp();
  v_participant_id uuid;
  v_result public.registration_result;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'register_guest_for_session requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  if btrim(coalesce(p_guest_name, '')) = '' then
    raise exception 'guest name is required' using errcode = 'JB011';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(p_session_id));

  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception 'session not found' using errcode = 'JB008';
  end if;

  if v_session.registration_state <> 'open' or v_session.status <> 'scheduled' then
    raise exception 'registration is not open' using errcode = 'JB001';
  end if;

  select
    count(*) filter (where status = 'confirmed'),
    count(*) filter (where status = 'waiting_list')
  into v_confirmed, v_waiting
  from public.participants
  where session_id = p_session_id;

  if v_confirmed < v_session.max_participants then
    v_status := 'confirmed';
  elsif v_waiting < v_session.waitlist_capacity then
    v_status := 'waiting_list';
  else
    raise exception 'session is full' using errcode = 'JB002';
  end if;

  -- No (session_id, user_id) conflict target applies here: user_id is null
  -- for every guest row, and unique treats each null as distinct, so a
  -- member can bring any number of guests to the same session with a plain
  -- insert (unlike register_for_session's upsert, which re-enters the same
  -- row for the same member).
  insert into public.participants
    (session_id, guest_name, guest_phone, registered_by, status, registered_at, consented_at)
  values (
    p_session_id, btrim(p_guest_name), nullif(btrim(coalesce(p_guest_phone, '')), ''),
    v_user, v_status, v_registered_at, v_registered_at
  )
  returning id into v_participant_id;

  v_result.status := v_status;

  if v_status = 'waiting_list' then
    v_result.waitlist_position :=
      public.waitlist_position_of(p_session_id, v_registered_at, v_participant_id);
  end if;

  return v_result;
end;
$$;

-- Cancelling a guest needs the participant id (a member can bring several
-- guests to the same session, so there's no single "my registration" row to
-- key off like cancel_registration's user_id lookup).
create or replace function public.cancel_guest_registration(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session_id uuid;
  v_rows int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'JB004';
  end if;

  select session_id into v_session_id
    from public.participants
   where id = p_participant_id and registered_by = v_user and guest_name is not null;

  if v_session_id is null then
    raise exception 'no active registration' using errcode = 'JB003';
  end if;

  perform pg_advisory_xact_lock(public.session_lock_key(v_session_id));

  update public.participants
     set status = 'cancelled',
         cancelled_at = now(),
         checked_in_at = null
   where id = p_participant_id
     and registered_by = v_user
     and status in ('confirmed', 'waiting_list');

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'no active registration' using errcode = 'JB003';
  end if;
end;
$$;

revoke execute on function
  public.register_guest_for_session(uuid, text, text),
  public.cancel_guest_registration(uuid)
from public, anon;

grant execute on function
  public.register_guest_for_session(uuid, text, text),
  public.cancel_guest_registration(uuid)
to authenticated;
