-- Admin report: per-member active membership and attendance over a date range.
--
-- SECURITY DEFINER so the report can read every profile/membership row;
-- authorization is the explicit is_admin() check, which is the first
-- statement. One row per profile. Active membership = started_at set, not
-- cancelled, expires_at in the future (queued ones have null started_at); a
-- lateral picks at most one, newest started_at first, so a user holding
-- several still yields one row. quota_used counts only live usages
-- (refunded_at is null), aggregated per membership so nothing fans out.
-- attended_count = confirmed participations with checked_in_at set on
-- non-cancelled, non-draft sessions in range, aggregated in its own lateral.
-- "In range" is by Asia/Jakarta calendar day (sessions.starts_at), p_to
-- inclusive. Null p_to = today (Jakarta); null p_from = p_to - 29. Guests
-- (user_id null) never match a profile. limit 5001 lets the caller detect
-- that a 5000-row cap was exceeded.
create or replace function public.report_members(
  p_from date default null,
  p_to date default null
)
returns table (
  member_id uuid,
  full_name text,
  plan_price_idr int,
  quota_total int,
  quota_used int,
  quota_left int,
  started_at timestamptz,
  expires_at timestamptz,
  has_active_membership boolean,
  attended_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to date;
  v_from date;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_to := coalesce(p_to, (pg_catalog.now() at time zone 'Asia/Jakarta')::date);
  v_from := coalesce(p_from, v_to - 29);

  return query
    select
      r.member_id,
      r.full_name,
      r.plan_price_idr,
      r.quota_total,
      r.quota_used,
      r.quota_left,
      r.started_at,
      r.expires_at,
      r.has_active_membership,
      r.attended_count
    from (
      select
        pr.id as member_id,
        coalesce(nullif(pg_catalog.btrim(pr.full_name), ''), 'Unnamed member') as full_name,
        am.price_idr as plan_price_idr,
        am.quota_total as quota_total,
        case when am.id is null then null
             else coalesce(u.used, 0)::int end as quota_used,
        case when am.id is null then null
             else (am.quota_total - coalesce(u.used, 0))::int end as quota_left,
        am.started_at as started_at,
        am.expires_at as expires_at,
        (am.id is not null) as has_active_membership,
        coalesce(att.attended, 0)::int as attended_count
      from public.profiles pr
      left join lateral (
        select m.id, m.price_idr, m.quota_total, m.started_at, m.expires_at
        from public.memberships m
        where m.user_id = pr.id
          and m.started_at is not null
          and m.cancelled_at is null
          and m.expires_at > pg_catalog.now()
        order by m.started_at desc, m.id
        limit 1
      ) am on true
      left join lateral (
        select pg_catalog.count(*) as used
        from public.membership_usages mu
        where mu.membership_id = am.id
          and mu.refunded_at is null
      ) u on am.id is not null
      left join lateral (
        select pg_catalog.count(*) as attended
        from public.participants p
        join public.sessions s on s.id = p.session_id
        where p.user_id = pr.id
          and p.status = 'confirmed'
          and p.checked_in_at is not null
          and s.status not in ('cancelled', 'draft')
          and (s.starts_at at time zone 'Asia/Jakarta')::date between v_from and v_to
      ) att on true
    ) r
    order by r.attended_count desc, r.full_name
    limit 5001;
end;
$$;

revoke execute on function public.report_members(date, date) from public, anon;
grant execute on function public.report_members(date, date) to authenticated;
