-- Hosts read a roster's gender without the participant-consent gate.
--
-- profiles_private_select_self_admin_or_host (20260914000001) requires
-- participants.consented_at for host visibility, because it also guards phone.
-- host_add_participant leaves consent unset, so a host-added member's gender was
-- unreadable and auto-match treated them as having no gender. Gender is a
-- matching input, not contact data, so it gets its own host-only read path.
-- phone stays behind the consent gate; the policy is unchanged.
--
-- SECURITY DEFINER because the caller cannot SELECT those rows under RLS.
-- Authorization is the explicit is_session_host check (host of this session, or
-- admin), the same boundary host_set_member_gender uses. Only non-cancelled
-- participants of that one session are returned, and only set values.
create or replace function public.host_roster_genders(p_session_id uuid)
returns table (user_id uuid, gender public.gender)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_session_host(p_session_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
    select pa.user_id, pp.gender
      from public.participants pa
      join public.profiles_private pp on pp.user_id = pa.user_id
     where pa.session_id = p_session_id
       and pa.status <> 'cancelled'
       and pp.gender is not null;
end;
$$;

revoke execute on function public.host_roster_genders(uuid) from public, anon;
grant execute on function public.host_roster_genders(uuid) to authenticated;
