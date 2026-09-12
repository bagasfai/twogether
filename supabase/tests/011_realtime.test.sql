begin;
select plan(2);

select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('sessions','participants','courts','matches','match_players')),
  5,
  'all five live tables are in the realtime publication'
);

select is(
  (select count(*)::int
     from pg_class
    where relname in ('sessions','participants','courts','matches','match_players')
      and relnamespace = 'public'::regnamespace
      and relreplident = 'f'),
  5,
  'all five live tables use replica identity full'
);

select * from finish();
rollback;
