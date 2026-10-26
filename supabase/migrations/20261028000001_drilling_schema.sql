-- Drilling sessions, schema layer (spec 2026-10-26-drilling-sessions-design.md
-- sections 3 and 8). A drilling session has coaches, each with a fixed number
-- of seats and one court. max_participants and court_count stay the single
-- source the registration RPCs read, so they are derived and CHECK-enforced.

create type public.session_kind as enum ('open_play', 'drilling');

alter table public.sessions
  add column kind public.session_kind not null default 'open_play',
  add column premium_surcharge_idr int not null default 0
    constraint sessions_premium_surcharge_nonneg check (premium_surcharge_idr >= 0),
  add column coach_count int,
  add column seats_per_coach int;

alter table public.sessions
  add constraint sessions_drilling_shape check (
    (kind = 'open_play' and coach_count is null and seats_per_coach is null)
    or (
      kind = 'drilling'
      -- NULL makes a comparison NULL, which a CHECK treats as pass, so test
      -- for NULL explicitly before comparing.
      and coach_count is not null
      and seats_per_coach is not null
      and coach_count > 0
      and seats_per_coach > 0
      and max_participants = coach_count * seats_per_coach
      and court_count = coach_count
    )
  );

-- replaced_by: set on the old row when the seat was handed over.
-- paid_by_user_id: set on the replacement row to the original member.
-- Both are written only by SECURITY DEFINER RPCs. The column grant from
-- 20260917000004_participants_update_column_grant.sql leaves authenticated
-- with UPDATE on checked_in_at alone, so new columns get no update grant.
alter table public.participants
  add column replaced_by uuid references public.participants (id),
  add column paid_by_user_id uuid references public.profiles (id);

-- Without this, a session registered as open play could switch to drilling
-- after members were promised a refund. Any participant row counts, including
-- cancelled ones. JB020: kind change with existing participants.
create function public.guard_session_kind_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind is distinct from old.kind
     and exists (select 1 from public.participants where session_id = old.id) then
    raise exception 'session kind cannot change once participants exist'
      using errcode = 'JB020';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_session_kind_change() from public, anon, authenticated;

create trigger sessions_guard_kind_change
before update of kind on public.sessions
for each row execute function public.guard_session_kind_change();
