-- JB006 isolation guard on adjust_session_capacity. Own file because `set
-- transaction isolation level` must be the first statement in the
-- transaction (see 010a_registration_isolation.test.sql).
begin;
set transaction isolation level repeatable read;

select plan(1);

insert into auth.users (id, email) values
  ('00000001-044a-044a-044a-000000000000', 'user-044a@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-044a-044a-044a-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.adjust_session_capacity(gen_random_uuid(), 2) $$,
  'JB006', null,
  'adjust_session_capacity refuses to run under repeatable read');

select * from finish();
rollback;
