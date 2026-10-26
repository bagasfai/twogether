begin;
select plan(19);

select has_table('public', 'member_levels', 'member_levels table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.member_levels'::regclass),
  true, 'RLS is enabled on member_levels');

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'ml-member@test.local'),
  ('cccccccc-0000-0000-0000-000000000002', 'ml-host@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'ml-admin@test.local'),
  ('cccccccc-0000-0000-0000-000000000004', 'ml-other@test.local');

update public.profiles set role = 'host'  where id = 'cccccccc-0000-0000-0000-000000000002';
update public.profiles set role = 'admin' where id = 'cccccccc-0000-0000-0000-000000000003';

-- seeded as table owner (bypasses RLS)
insert into public.member_levels (user_id, level) values
  ('cccccccc-0000-0000-0000-000000000001', 'beginner');

select is(has_table_privilege('anon', 'public.member_levels', 'select'), false,
  'anon has no select');
select is(has_table_privilege('anon', 'public.member_levels', 'insert'), false,
  'anon has no insert');

set local role authenticated;

-- plain member
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.member_levels), 0,
  'member sees zero rows, even own');
select throws_ok(
  $$insert into public.member_levels (user_id, level)
    values ('cccccccc-0000-0000-0000-000000000004', 'advanced')$$,
  '42501', null, 'member insert denied');

-- host
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$insert into public.member_levels (user_id, level, set_by)
    values ('cccccccc-0000-0000-0000-000000000004', 'intermediate',
            'cccccccc-0000-0000-0000-000000000002')$$,
  'host can insert');
select lives_ok(
  $$update public.member_levels set level = 'advanced'
    where user_id = 'cccccccc-0000-0000-0000-000000000004'$$,
  'host can update');
select is(
  (select level::text from public.member_levels
    where user_id = 'cccccccc-0000-0000-0000-000000000004'),
  'advanced', 'host update took effect');

-- admin
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.member_levels
            where user_id in ('cccccccc-0000-0000-0000-000000000001',
                              'cccccccc-0000-0000-0000-000000000004')), 2,
  'admin selects all seeded rows');

-- member update affects nothing (RLS hides every row), delete has no grant
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$update public.member_levels set level = 'advanced'$$,
  'member update runs but RLS hides every row');
select throws_ok(
  $$delete from public.member_levels$$, '42501', null,
  'member delete denied (no delete grant)');

-- host upsert: the statement PostgREST emits for .upsert({onConflict:'user_id'})
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select level::text from public.member_levels
            where user_id = 'cccccccc-0000-0000-0000-000000000001'),
  'beginner', 'member update affected nothing');
select lives_ok(
  $$insert into public.member_levels (user_id, level, set_by)
    values ('cccccccc-0000-0000-0000-000000000003', 'novice', 'cccccccc-0000-0000-0000-000000000002')
    on conflict (user_id) do update set level = excluded.level, set_by = excluded.set_by$$,
  'host upsert inserts a new row');

-- age the row (owner, triggers off) so the refresh is observable
reset role;
set local session_replication_role = replica;
update public.member_levels set updated_at = now() - interval '1 day'
  where user_id = 'cccccccc-0000-0000-0000-000000000003';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$insert into public.member_levels (user_id, level, set_by)
    values ('cccccccc-0000-0000-0000-000000000003', 'advanced', 'cccccccc-0000-0000-0000-000000000002')
    on conflict (user_id) do update set level = excluded.level, set_by = excluded.set_by$$,
  'host upsert updates the existing row');
select is((select count(*)::int from public.member_levels
            where user_id = 'cccccccc-0000-0000-0000-000000000003'), 1,
  'upsert leaves exactly one row');
select is((select level::text from public.member_levels
            where user_id = 'cccccccc-0000-0000-0000-000000000003'),
  'advanced', 'upsert took the new level');
select is((select set_by from public.member_levels
            where user_id = 'cccccccc-0000-0000-0000-000000000003'),
  'cccccccc-0000-0000-0000-000000000002'::uuid, 'upsert set_by is the host');
select ok((select updated_at > now() - interval '1 hour' from public.member_levels
            where user_id = 'cccccccc-0000-0000-0000-000000000003'),
  'upsert refreshed updated_at');

select * from finish();
rollback;
