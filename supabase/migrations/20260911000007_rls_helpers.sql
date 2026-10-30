create or replace function public.is_session_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1 from public.session_hosts
     where session_id = p_session_id
       and user_id = auth.uid()
  );
$$;

create or replace function public.is_session_owner(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1 from public.session_hosts
     where session_id = p_session_id
       and user_id = auth.uid()
       and role = 'owner'
  );
$$;

create or replace function public.session_is_public(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions
     where id = p_session_id
       and status in ('scheduled', 'live', 'completed')
  );
$$;

revoke execute on function
  public.is_session_host(uuid),
  public.is_session_owner(uuid),
  public.session_is_public(uuid)
from public;

grant execute on function
  public.is_session_host(uuid),
  public.is_session_owner(uuid),
  public.session_is_public(uuid)
to authenticated, anon;
