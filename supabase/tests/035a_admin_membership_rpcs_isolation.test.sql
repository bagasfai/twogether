-- JB006 isolation guard on the admin membership RPCs. Own file because `set
-- transaction isolation level` must be the first statement in the
-- transaction (see 010a_registration_isolation.test.sql).
begin;
set transaction isolation level repeatable read;

select plan(2);

insert into auth.users (id, email) values
  ('00000001-035a-035a-035a-000000000000', 'admin-035a@test.local');
update public.profiles set role = 'admin'
 where id = '00000001-035a-035a-035a-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-035a-035a-035a-000000000000","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_grant_membership(
       '00000001-035a-035a-035a-000000000000', gen_random_uuid(), now()) $$,
  'JB006', null,
  'admin_grant_membership refuses to run under repeatable read');
select throws_ok(
  $$ select public.admin_cancel_membership(gen_random_uuid()) $$,
  'JB006', null,
  'admin_cancel_membership refuses to run under repeatable read');

select * from finish();
rollback;
