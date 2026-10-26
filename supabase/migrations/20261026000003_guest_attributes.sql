-- Host/admin-only attributes for guest participants. Kept out of
-- public.participants on purpose: participants_select_self_host_or_public lets
-- registered_by (the member who brought the guest) and, for public sessions,
-- everyone read guest rows. Attributes here must never be visible to them.
create table public.guest_attributes (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  gender public.gender,
  level public.skill_level,
  updated_at timestamptz not null default now()
);

create trigger guest_attributes_set_updated_at
before update on public.guest_attributes
for each row execute function public.set_updated_at();

-- A check constraint cannot reference another table, so guest-only is a trigger.
-- A missing participant also fails here (v_guest stays null).
create or replace function public.guest_attributes_require_guest()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guest text;
begin
  select guest_name into v_guest from public.participants where id = new.participant_id;
  if v_guest is null then
    raise exception 'guest_attributes only attach to guest participants'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guest_attributes_guest_only
before insert on public.guest_attributes
for each row execute function public.guest_attributes_require_guest();

alter table public.guest_attributes enable row level security;

revoke all on public.guest_attributes from anon, authenticated;
-- participant_id is the PK and is deliberately not updatable: a host must not
-- repoint an attribute row at a member participant or another session's guest.
grant select, insert on public.guest_attributes to authenticated;
grant update (gender, level, updated_at) on public.guest_attributes to authenticated;

-- Fail closed: the predicate is an EXISTS over the participant row, so a
-- nonexistent participant yields false (not NULL, and not admin's blanket
-- true from is_session_host(NULL)). is_session_host already includes admins.
create policy guest_attributes_select on public.guest_attributes
  for select to authenticated
  using (exists (
    select 1 from public.participants p
     where p.id = guest_attributes.participant_id
       and public.is_session_host(p.session_id)
  ));

create policy guest_attributes_insert on public.guest_attributes
  for insert to authenticated
  with check (exists (
    select 1 from public.participants p
     where p.id = guest_attributes.participant_id
       and public.is_session_host(p.session_id)
  ));

create policy guest_attributes_update on public.guest_attributes
  for update to authenticated
  using (exists (
    select 1 from public.participants p
     where p.id = guest_attributes.participant_id
       and public.is_session_host(p.session_id)
  ))
  with check (exists (
    select 1 from public.participants p
     where p.id = guest_attributes.participant_id
       and public.is_session_host(p.session_id)
  ));
