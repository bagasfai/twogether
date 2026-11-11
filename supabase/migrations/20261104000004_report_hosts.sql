-- Admin report: per-host session counts, fill and waitlist over a date range.
--
-- SECURITY DEFINER so the report can read every session/participant row;
-- authorization is the explicit is_admin() check, which is the first
-- statement. One row per user in session_hosts (owners and co-hosts) with at
-- least one non-draft session in range. session_hosts is unique on
-- (session_id, user_id), so a host never counts a session twice.
-- Participants are aggregated per session first, then sessions per host, so
-- nothing fans out. sessions_hosted counts non-draft sessions including
-- cancelled; avg_fill_rate (confirmed / max_participants, percent, 1 decimal)
-- and peak_waitlist only look at non-cancelled sessions. avg_fill_rate is
-- null when there are none. participant_cancellations counts cancelled
-- participants in all of the host's in-range non-draft sessions.
-- "In range" is by Asia/Jakarta calendar day (sessions.starts_at), p_to
-- inclusive. Null p_to = today (Jakarta); null p_from = p_to - 29.
-- limit 5001 lets the caller detect that a 5000-row cap was exceeded.
create or replace function public.report_hosts(
  p_from date default null,
  p_to date default null
)
returns table (
  host_id uuid,
  full_name text,
  sessions_hosted int,
  completed_sessions int,
  cancelled_sessions int,
  avg_fill_rate numeric,
  peak_waitlist int,
  participant_cancellations int
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
      r.host_id,
      r.full_name,
      r.sessions_hosted,
      r.completed_sessions,
      r.cancelled_sessions,
      r.avg_fill_rate,
      r.peak_waitlist,
      r.participant_cancellations
    from (
      select
        sh.user_id as host_id,
        coalesce(nullif(pg_catalog.btrim(pr.full_name), ''), 'Unnamed member') as full_name,
        pg_catalog.count(*)::int as sessions_hosted,
        (pg_catalog.count(*) filter (where s.status = 'completed'))::int as completed_sessions,
        (pg_catalog.count(*) filter (where s.status = 'cancelled'))::int as cancelled_sessions,
        pg_catalog.round(
          pg_catalog.avg(pc.confirmed * 100.0 / nullif(s.max_participants, 0))
            filter (where s.status <> 'cancelled'),
          1
        ) as avg_fill_rate,
        coalesce(
          pg_catalog.max(pc.waiting) filter (where s.status <> 'cancelled'),
          0
        )::int as peak_waitlist,
        coalesce(pg_catalog.sum(pc.cancelled), 0)::int as participant_cancellations
      from public.session_hosts sh
      join public.sessions s on s.id = sh.session_id
      join public.profiles pr on pr.id = sh.user_id
      left join lateral (
        select
          pg_catalog.count(*) filter (where p.status = 'confirmed') as confirmed,
          pg_catalog.count(*) filter (where p.status = 'waiting_list') as waiting,
          pg_catalog.count(*) filter (where p.status = 'cancelled') as cancelled
        from public.participants p
        where p.session_id = s.id
      ) pc on true
      where s.status <> 'draft'
        and (s.starts_at at time zone 'Asia/Jakarta')::date between v_from and v_to
      group by sh.user_id, pr.full_name
    ) r
    order by r.sessions_hosted desc, r.full_name
    limit 5001;
end;
$$;

revoke execute on function public.report_hosts(date, date) from public, anon;
grant execute on function public.report_hosts(date, date) to authenticated;
