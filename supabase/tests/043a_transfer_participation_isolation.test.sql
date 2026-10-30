-- JB006 isolation guard on transfer_participation. Own file because `set
-- transaction isolation level` must be the first statement in the
-- transaction (see 010a_registration_isolation.test.sql).
begin;
set transaction isolation level repeatable read;

select plan(1);

insert into auth.users (id, email) values
  ('00000001-043a-043a-043a-000000000000', 'user-043a@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-043a-043a-043a-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.transfer_participation(gen_random_uuid(), gen_random_uuid()) $$,
  'JB006', null,
  'transfer_participation refuses to run under repeatable read');

select * from finish();
rollback;
