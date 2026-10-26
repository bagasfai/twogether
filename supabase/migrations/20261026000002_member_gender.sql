-- Gender lives on profiles_private, not profiles: profiles is readable by every
-- authenticated user. Existing profiles_private_update_self policy and the
-- table-level UPDATE grant already cover a member editing their own gender.
alter table public.profiles_private add column gender public.gender;

-- Host/admin set another member's gender. SECURITY DEFINER because profiles_private
-- has no INSERT grant and no host UPDATE policy; authorization is the explicit check.
create or replace function public.host_set_member_gender(p_user_id uuid, p_gender public.gender)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('host', 'admin') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  insert into public.profiles_private (user_id, gender)
  values (p_user_id, p_gender)
  on conflict (user_id) do update set gender = excluded.gender;
end;
$$;

revoke execute on function public.host_set_member_gender(uuid, public.gender) from public, anon;
grant execute on function public.host_set_member_gender(uuid, public.gender) to authenticated;
