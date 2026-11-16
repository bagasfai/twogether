create type public.email_type as enum (
  'registration_confirmed',
  'registration_waitlisted',
  'registration_cancelled',
  'waitlist_promoted',
  'bumped',
  'session_cancelled',
  'session_changed',
  'session_reminder'
);

alter table public.profiles
  add column email_reminders boolean not null default true;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  type public.email_type not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);

create index email_outbox_pending_idx on public.email_outbox (created_at)
  where sent_at is null;

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;

create function public.claim_email_outbox(p_limit int)
returns setof public.email_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.email_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.id in (
     select id from public.email_outbox
      where sent_at is null
        and attempts < 3
        and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      order by created_at, id
      limit p_limit
      for update skip locked)
  returning o.*;
$$;

revoke execute on function public.claim_email_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(int) to service_role;
