-- core-schema-follow-ups.md, "Should fix soon": sessions.created_by had no
-- explicit `on delete` action, so it defaulted to `restrict` -- an admin
-- deleting any profile that has ever created a session (via the
-- profiles_delete_admin policy) hit a bare FK error instead of the delete
-- succeeding. Product decision: null out the pointer to the since-deleted
-- creator; keep the session and its history.

begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-4444-4444-4444-444444444444', 'host-023@test.local'),
  ('22222222-4444-4444-4444-444444444444', 'admin-023@test.local');

update public.profiles set role = 'admin'
 where id = '22222222-4444-4444-4444-444444444444';

insert into public.sessions
  (id, title, starts_at, ends_at, location, max_participants, created_by, status)
values
  ('aaaaaaaa-4444-4444-4444-444444444444', 'Created By Test',
   now() + interval '1 day', now() + interval '1 day 2 hours',
   'GOR Jakbar', 16, '11111111-4444-4444-4444-444444444444', 'scheduled');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$ delete from public.profiles where id = '11111111-4444-4444-4444-444444444444' $$,
  'an admin can delete a profile that has created a session'
);

reset role;

select is(
  (select created_by from public.sessions
    where id = 'aaaaaaaa-4444-4444-4444-444444444444'),
  null,
  'the session keeps its row with created_by nulled out'
);

select is(
  (select count(*)::int from public.sessions
    where id = 'aaaaaaaa-4444-4444-4444-444444444444'),
  1,
  'the session itself is not deleted'
);

select * from finish();
rollback;
