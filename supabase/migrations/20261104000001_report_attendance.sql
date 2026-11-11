-- Admin report: per-member attendance over a date range.
--
-- SECURITY DEFINER so the report can read every member's participants/profiles
-- rows; authorization is the explicit is_admin() check, which is the first
-- statement. "In range" is by Asia/Jakarta calendar day of sessions.starts_at,
-- p_to inclusive. Null p_to = today (Jakarta); null p_from = p_to - 29.
-- Cancelled and draft sessions are excluded. Guests (user_id null) never join
-- to a profile, so they cannot appear. limit 5001 lets the caller detect that
-- a 5000-row cap was exceeded.
create or replace function public.report_attendance(
  p_from date default null,
  p_to date default null
)
returns table (
  member_id uuid,
  full_name text,
  registered_count int,
  attended_count int,
  no_show_count int,
  cancelled_count int,
  attendance_rate numeric,
  last_attended_at timestamptz
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
      pr.id,
      coalesce(nullif(pg_catalog.btrim(pr.full_name), ''), 'Unnamed member'),
      (pg_catalog.count(*) filter (where pa.status = 'confirmed'))::int,
      (pg_catalog.count(*) filter (
        where pa.status = 'confirmed' and pa.checked_in_at is not null))::int,
      (pg_catalog.count(*) filter (
        where pa.status = 'confirmed' and pa.no_show_at is not null))::int,
      (pg_catalog.count(*) filter (where pa.status = 'cancelled'))::int,
      pg_catalog.round(
        100.0
          * (pg_catalog.count(*) filter (
              where pa.status = 'confirmed' and pa.checked_in_at is not null))
          / nullif(pg_catalog.count(*) filter (where pa.status = 'confirmed'), 0),
        1),
      pg_catalog.max(pa.checked_in_at) filter (where pa.status = 'confirmed')
    from public.profiles pr
    join public.participants pa on pa.user_id = pr.id
    join public.sessions s on s.id = pa.session_id
    where s.status not in ('cancelled', 'draft')
      and (s.starts_at at time zone 'Asia/Jakarta')::date between v_from and v_to
      and pa.status in ('confirmed', 'cancelled')
    group by pr.id, pr.full_name
    order by 4 desc, 2
    limit 5001;
end;
$$;

revoke execute on function public.report_attendance(date, date) from public, anon;
grant execute on function public.report_attendance(date, date) to authenticated;
