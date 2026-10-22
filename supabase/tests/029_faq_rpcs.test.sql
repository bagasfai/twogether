-- FAQ ordering RPCs (faq_create / faq_move / faq_delete): behaviour, error
-- codes, role gating and grant surface. The JB006 isolation guard lives in
-- 029a_faq_rpcs_isolation.test.sql (needs its own transaction, like 010a).
begin;
select plan(30);

insert into auth.users (id, email) values
  ('11111111-8888-8888-8888-888888888888', 'admin-029@test.local'),
  ('22222222-8888-8888-8888-888888888888', 'host-029@test.local'),
  ('33333333-8888-8888-8888-888888888888', 'member-029@test.local');

update public.profiles set role = 'admin'
 where id = '11111111-8888-8888-8888-888888888888';
update public.profiles set role = 'host'
 where id = '22222222-8888-8888-8888-888888888888';

-- Holds the ids the admin creates so later statements can address them.
create temp table made (k int primary key, id uuid not null);
grant all on made to authenticated, anon;

-- ---- grant surface (as the migration owner) ----

select ok(
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.faq_create(text,text,text,text)'::regprocedure,
                  'public.faq_move(uuid,text)'::regprocedure,
                  'public.faq_delete(uuid)'::regprocedure)),
  'all three RPCs are security definer'
);

select ok(
  not has_function_privilege('anon', 'public.faq_create(text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.faq_move(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.faq_delete(uuid)', 'execute'),
  'anon has no execute on any FAQ RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.faq_create(text,text,text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.faq_move(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.faq_delete(uuid)', 'execute'),
  'authenticated has execute on every FAQ RPC'
);

select ok(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
     where p.oid in ('public.faq_create(text,text,text,text)'::regprocedure,
                     'public.faq_move(uuid,text)'::regprocedure,
                     'public.faq_delete(uuid)'::regprocedure)
       and a.grantee = 0
  ),
  'PUBLIC has no execute on any FAQ RPC'
);

-- ---- role gating (before any row exists) ----

set local role authenticated;

set local request.jwt.claims = '{"sub":"33333333-8888-8888-8888-888888888888","role":"authenticated"}';
select throws_ok(
  $$ select public.faq_create('q', 'q', 'a', 'a') $$, 'JB007', null,
  'member cannot faq_create');
select throws_ok(
  $$ select public.faq_move(gen_random_uuid(), 'up') $$, 'JB007', null,
  'member cannot faq_move');
select throws_ok(
  $$ select public.faq_delete(gen_random_uuid()) $$, 'JB007', null,
  'member cannot faq_delete');

set local request.jwt.claims = '{"sub":"22222222-8888-8888-8888-888888888888","role":"authenticated"}';
select throws_ok(
  $$ select public.faq_create('q', 'q', 'a', 'a') $$, 'JB007', null,
  'host cannot faq_create');
select throws_ok(
  $$ select public.faq_move(gen_random_uuid(), 'up') $$, 'JB007', null,
  'host cannot faq_move');
select throws_ok(
  $$ select public.faq_delete(gen_random_uuid()) $$, 'JB007', null,
  'host cannot faq_delete');

reset role;
set local role anon;
set local request.jwt.claims = '';
select throws_ok(
  $$ select public.faq_create('q', 'q', 'a', 'a') $$, '42501', null,
  'anon cannot faq_create (privilege error)');
select throws_ok(
  $$ select public.faq_move(gen_random_uuid(), 'up') $$, '42501', null,
  'anon cannot faq_move (privilege error)');
select throws_ok(
  $$ select public.faq_delete(gen_random_uuid()) $$, '42501', null,
  'anon cannot faq_delete (privilege error)');

reset role;
select is((select count(*)::int from public.faq_items), 0,
  'rejected callers created nothing');

-- ---- admin behaviour ----

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-8888-8888-8888-888888888888","role":"authenticated"}';

insert into made select 1, public.faq_create('Q1 en', 'Q1 id', 'A1 en', 'A1 id');
insert into made select 2, public.faq_create('Q2 en', 'Q2 id', 'A2 en', 'A2 id');
insert into made select 3, public.faq_create('Q3 en', 'Q3 id', 'A3 en', 'A3 id');

select is((select count(distinct id)::int from made), 3,
  'faq_create returned three distinct ids');

select is(
  (select array_agg(f.sort_order order by m.k)
     from made m join public.faq_items f on f.id = m.id),
  array[1, 2, 3],
  'faq_create appended at sort_order 1, 2, 3'
);

select public.faq_move((select id from made where k = 2), 'up');
select is(
  (select array_agg(f.sort_order order by m.k)
     from made m join public.faq_items f on f.id = m.id),
  array[2, 1, 3],
  'faq_move up swapped the second item with the first'
);

select lives_ok(
  $$ select public.faq_move((select id from made where k = 2), 'up') $$,
  'moving the first item up does not error');
select is(
  (select array_agg(f.sort_order order by m.k)
     from made m join public.faq_items f on f.id = m.id),
  array[2, 1, 3],
  'moving the first item up leaves the order unchanged'
);

select lives_ok(
  $$ select public.faq_move((select id from made where k = 3), 'down') $$,
  'moving the last item down does not error');
select is(
  (select array_agg(f.sort_order order by m.k)
     from made m join public.faq_items f on f.id = m.id),
  array[2, 1, 3],
  'moving the last item down leaves the order unchanged'
);

select public.faq_move((select id from made where k = 2), 'down');
select is(
  (select array_agg(f.sort_order order by m.k)
     from made m join public.faq_items f on f.id = m.id),
  array[1, 2, 3],
  'faq_move down swapped the item back with its neighbour'
);

select lives_ok(
  $$ select public.faq_delete((select id from made where k = 2)) $$,
  'faq_delete removes the middle item');
select is(
  (select array_agg(sort_order order by sort_order) from public.faq_items),
  array[1, 2],
  'remaining positions are gapless after delete'
);
select is(
  (select count(*)::int from public.faq_items
    where id = (select id from made where k = 2)),
  0,
  'the deleted id is gone'
);
select is(
  (select sort_order from public.faq_items where id = (select id from made where k = 3)),
  2,
  'the item after the deleted one moved up by one'
);

-- ---- errors ----

select throws_ok(
  $$ select public.faq_move(gen_random_uuid(), 'up') $$, 'JB008', null,
  'faq_move on an unknown id raises JB008');
select throws_ok(
  $$ select public.faq_delete(gen_random_uuid()) $$, 'JB008', null,
  'faq_delete on an unknown id raises JB008');
select throws_ok(
  $$ select public.faq_move((select id from made where k = 1), 'sideways') $$,
  'JB011', null,
  'faq_move with an invalid direction raises JB011');
select throws_ok(
  $$ select public.faq_create('Q', 'Q', E' \t\n', 'A') $$, '23514', null,
  'faq_create with a blank answer raises the check violation');

select * from finish();
rollback;
