-- JB006 isolation guard on the FAQ RPCs. Own file because `set transaction
-- isolation level` must be the first statement in the transaction (see
-- 010a_registration_isolation.test.sql).
begin;
set transaction isolation level repeatable read;

select plan(3);

insert into auth.users (id, email) values
  ('11111111-8888-8888-8888-888888888889', 'admin-029a@test.local');
update public.profiles set role = 'admin'
 where id = '11111111-8888-8888-8888-888888888889';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-8888-8888-8888-888888888889","role":"authenticated"}';

select throws_ok(
  $$ select public.faq_create('q', 'q', 'a', 'a') $$, 'JB006', null,
  'faq_create refuses to run under repeatable read');
select throws_ok(
  $$ select public.faq_move(gen_random_uuid(), 'up') $$, 'JB006', null,
  'faq_move refuses to run under repeatable read');
select throws_ok(
  $$ select public.faq_delete(gen_random_uuid()) $$, 'JB006', null,
  'faq_delete refuses to run under repeatable read');

select * from finish();
rollback;
