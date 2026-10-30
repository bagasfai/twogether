create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.participant_status not null,
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index participants_session_status_idx
  on public.participants (session_id, status);

create index participants_waitlist_order_idx
  on public.participants (session_id, registered_at)
  where status = 'waiting_list';

create index participants_checked_in_idx
  on public.participants (session_id)
  where checked_in_at is not null;

create index participants_user_idx
  on public.participants (user_id, status);

create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();
