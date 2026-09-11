create type public.user_role as enum ('member', 'host', 'admin');
create type public.session_status as enum ('draft', 'scheduled', 'live', 'completed', 'cancelled');
create type public.registration_state as enum ('closed', 'open');
create type public.participant_status as enum ('confirmed', 'waiting_list', 'cancelled');
create type public.session_host_role as enum ('owner', 'cohost');
create type public.court_status as enum ('idle', 'in_use', 'unavailable');
create type public.match_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
