begin;
select plan(4);

select has_column('public', 'participants', 'no_show_at', 'participants has a no_show_at column');
select col_type_is('public', 'participants', 'no_show_at', 'timestamp with time zone',
                   'no_show_at is a timestamptz');

insert into auth.users (id, email) values
  ('11111111-3333-3333-3333-333333333333', 'member-021@test.local'),
  ('22222222-3333-3333-3333-333333333333', 'host-021@test.local');

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-3333-3333-3333-333333333333', 'Completed Session',
   now() - interval '1 day', now() - interval '1 day' + interval '2 hours',
   'GOR Jakbar', 16, '22222222-3333-3333-3333-333333333333', 'completed');

-- add_session_owner() already inserts the session_hosts owner row for
-- created_by on session insert (20260911000003_sessions.sql) -- no manual
-- insert needed here.

insert into public.participants (id, session_id, user_id, status)
values ('cccccccc-3333-3333-3333-333333333333',
        'aaaaaaaa-3333-3333-3333-333333333333',
        '11111111-3333-3333-3333-333333333333', 'confirmed');

select is(
  (select no_show_at from public.participants
    where id = 'cccccccc-3333-3333-3333-333333333333'),
  null,
  'a new participant is not marked no-show by default'
);

-- Same column-grant shape as paid_at/checked_in_at: not a capacity-racing
-- decision, so a direct UPDATE gated by participants_update_host's row scope
-- plus an explicit no_show_at column grant is enough -- no RPC.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-3333-3333-3333-333333333333","role":"authenticated"}';

update public.participants
   set no_show_at = now()
 where id = 'cccccccc-3333-3333-3333-333333333333';

reset role;

select is(
  (select no_show_at is not null from public.participants
    where id = 'cccccccc-3333-3333-3333-333333333333'),
  true,
  'the session host can mark a participant as a no-show via a direct UPDATE'
);

select * from finish();
rollback;
