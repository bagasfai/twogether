begin;
select plan(11);

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
select is((select count(*)::int from public.member_levels), 2,
  'admin selects all rows');

-- member update affects nothing
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$delete from public.member_levels$$, '42501', null,
  'member delete denied (no delete grant)');

select * from finish();
rollback;
