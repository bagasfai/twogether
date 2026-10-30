-- Premium membership schema, RLS and grants
-- (docs/superpowers/specs/2026-10-23-premium-membership-design.md, sections 3 and 5).
-- Tables and columns only. Writes to memberships, membership_usages and
-- bump_notifications happen exclusively through security definer RPCs and
-- triggers added by later migrations, so clients get no write grants on them.
-- membership_plans is admin-writable directly, gated by RLS.

-- ---- membership_plans ----

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (length(btrim(name, E' \t\r\n')) > 0 and char_length(name) <= 120),
  price_idr integer not null check (price_idr >= 0),
  quota integer not null check (quota > 0),
  duration_days integer not null check (duration_days > 0),
  refund_cutoff_hours integer not null default 24 check (refund_cutoff_hours >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger membership_plans_set_updated_at
before update on public.membership_plans
for each row execute function public.set_updated_at();

-- ---- memberships (one row per purchase) ----

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Informational only: the values below are copied from the plan.
  plan_id uuid references public.membership_plans (id) on delete set null,
  price_idr integer not null check (price_idr >= 0),
  quota_total integer not null check (quota_total > 0),
  duration_days integer not null check (duration_days > 0),
  refund_cutoff_hours integer not null default 24 check (refund_cutoff_hours >= 0),
  payment_received_at timestamptz,
  activated_by uuid references public.profiles (id) on delete set null,
  -- Null while queued behind a live membership; set when first current.
  started_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index memberships_user_id_idx on public.memberships (user_id);

-- ---- membership_usages (quota ledger) ----

create table public.membership_usages (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  consumed_at timestamptz not null default now(),
  refunded_at timestamptz,
  refund_reason text
);

create index membership_usages_membership_id_idx
  on public.membership_usages (membership_id);

-- One live usage per participant; refunded rows may repeat when the same
-- participant row re-registers after a cancel.
create unique index membership_usages_one_live_per_participant
  on public.membership_usages (participant_id)
  where refunded_at is null;

-- ---- bump_notifications (email outbox) ----

create table public.bump_notifications (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index bump_notifications_pending_idx
  on public.bump_notifications (created_at) where sent_at is null;

-- ---- participants columns ----

alter table public.participants
  add column is_premium boolean not null default false,
  add column membership_id uuid references public.memberships (id) on delete set null,
  add column bumped_at timestamptz;

-- ---- RLS and grants ----

alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_usages enable row level security;
alter table public.bump_notifications enable row level security;

revoke all on public.membership_plans from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.membership_usages from anon, authenticated;
revoke all on public.bump_notifications from anon, authenticated;

grant select, insert, update, delete on public.membership_plans to authenticated;
grant select on public.memberships to authenticated;
grant select on public.membership_usages to authenticated;
-- bump_notifications: RLS on, no policies, no grants.

create policy membership_plans_select_active on public.membership_plans
  for select to authenticated using (is_active);

create policy membership_plans_select_admin on public.membership_plans
  for select to authenticated using (public.is_admin());

create policy membership_plans_insert_admin on public.membership_plans
  for insert to authenticated with check (public.is_admin());

create policy membership_plans_update_admin on public.membership_plans
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy membership_plans_delete_admin on public.membership_plans
  for delete to authenticated using (public.is_admin());

create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy membership_usages_select on public.membership_usages
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.memberships m
       where m.id = membership_usages.membership_id
         and m.user_id = auth.uid()
    )
  );
