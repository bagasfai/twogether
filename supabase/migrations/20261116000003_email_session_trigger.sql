create function public.queue_session_email()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_type public.email_type;
  v_payload jsonb := '{}';
begin
  if old.status in ('scheduled', 'live') and new.status = 'cancelled' then
    v_type := 'session_cancelled';
  elsif old.status = 'scheduled' and new.status = 'scheduled'
    and (new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.location is distinct from old.location) then
    v_type := 'session_changed';
    v_payload := jsonb_build_object(
      'old_starts_at', old.starts_at,
      'old_ends_at', old.ends_at,
      'old_location', old.location);
  else
    return null;
  end if;

  insert into public.email_outbox (type, user_id, session_id, payload)
  select v_type, p.user_id, new.id, v_payload
    from public.participants p
   where p.session_id = new.id
     and p.user_id is not null
     and p.status in ('confirmed', 'waiting_list');
  return null;
end; $$;

revoke execute on function public.queue_session_email() from public, anon, authenticated;

create trigger sessions_queue_email
  after update on public.sessions
  for each row execute function public.queue_session_email();

create function public.queue_session_reminders()
returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  insert into public.email_outbox (type, user_id, session_id, dedupe_key)
  select 'session_reminder', p.user_id, s.id, 'reminder:' || s.id || ':' || p.user_id
    from public.sessions s
    join public.participants p on p.session_id = s.id
    join public.profiles pr on pr.id = p.user_id
   where s.status = 'scheduled'
     and (s.starts_at at time zone 'Asia/Jakarta')::date
         = (now() at time zone 'Asia/Jakarta')::date + 1
     and p.status = 'confirmed'
     and p.user_id is not null
     and pr.email_reminders
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke execute on function public.queue_session_reminders() from public, anon, authenticated;
grant execute on function public.queue_session_reminders() to service_role;
