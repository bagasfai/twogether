-- Admin report: cash-basis revenue over a date range (session rows + membership
-- sale rows).
--
-- SECURITY DEFINER so the report can read every participant/membership row;
-- authorization is the explicit is_admin() check, which is the first
-- statement. "In range" is by Asia/Jakarta calendar day (sessions.starts_at,
-- memberships.payment_received_at), p_to inclusive. Null p_to = today
-- (Jakarta); null p_from = p_to - 29.
-- Cash basis: a confirmed participant with a live membership_usages row
-- (refunded_at is null) is quota-covered and adds no session revenue; one
-- whose usage was refunded falls back to participants.paid_at. Liveness is an
-- EXISTS so several usage rows per participant never double count. Null
-- session price counts as 0. Guests (user_id null) count in session totals.
-- Cancelled and draft sessions are excluded. Membership rows ignore
-- cancelled_at (no refund ledger yet). limit 5001 lets the caller detect that
-- a 5000-row cap was exceeded.
create or replace function public.report_revenue(
  p_from date default null,
  p_to date default null
)
returns table (
  row_kind text,
  ref_id uuid,
  label text,
  occurred_at timestamptz,
  price int,
  confirmed_count int,
  covered_count int,
  paid_count int,
  unpaid_count int,
  cash_collected bigint,
  outstanding bigint
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
    select *
    from (
      select
        'session'::text as row_kind,
        s.id as ref_id,
        s.title as label,
        s.starts_at as occurred_at,
        s.price as price,
        pg_catalog.count(pa.id)::int as confirmed_count,
        (pg_catalog.count(pa.id) filter (where pa.covered))::int as covered_count,
        (pg_catalog.count(pa.id) filter (
          where not pa.covered and pa.paid_at is not null))::int as paid_count,
        (pg_catalog.count(pa.id) filter (
          where not pa.covered and pa.paid_at is null))::int as unpaid_count,
        ((pg_catalog.count(pa.id) filter (
          where not pa.covered and pa.paid_at is not null))
          * coalesce(s.price, 0))::bigint as cash_collected,
        ((pg_catalog.count(pa.id) filter (
          where not pa.covered and pa.paid_at is null))
          * coalesce(s.price, 0))::bigint as outstanding
      from public.sessions s
      left join lateral (
        select
          p.id,
          p.paid_at,
          exists (
            select 1
            from public.membership_usages mu
            where mu.participant_id = p.id
              and mu.refunded_at is null
          ) as covered
        from public.participants p
        where p.session_id = s.id
          and p.status = 'confirmed'
      ) pa on true
      where s.status not in ('cancelled', 'draft')
        and (s.starts_at at time zone 'Asia/Jakarta')::date between v_from and v_to
      group by s.id, s.title, s.starts_at, s.price

      union all

      select
        'membership'::text,
        m.id,
        coalesce(nullif(pg_catalog.btrim(pr.full_name), ''), 'Unnamed member'),
        m.payment_received_at,
        m.price_idr,
        0,
        0,
        1,
        0,
        m.price_idr::bigint,
        0::bigint
      from public.memberships m
      join public.profiles pr on pr.id = m.user_id
      where m.payment_received_at is not null
        and (m.payment_received_at at time zone 'Asia/Jakarta')::date
              between v_from and v_to
    ) r
    order by r.row_kind desc, r.occurred_at desc
    limit 5001;
end;
$$;

revoke execute on function public.report_revenue(date, date) from public, anon;
grant execute on function public.report_revenue(date, date) to authenticated;
