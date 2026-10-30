-- Guard: skill/gender data is host-only and must never be broadcast over Realtime.
begin;
select plan(4);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'member_levels'),
  0, 'member_levels is not in the supabase_realtime publication');
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'guest_attributes'),
  0, 'guest_attributes is not in the supabase_realtime publication');
select hasnt_column('public', 'participants', 'gender', 'participants has no gender column');
select hasnt_column('public', 'participants', 'level', 'participants has no level column');

select * from finish();
rollback;
