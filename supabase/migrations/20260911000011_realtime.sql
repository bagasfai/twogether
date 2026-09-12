-- replica identity full so UPDATE and DELETE events carry old values;
-- without it "player removed from court" arrives with no way to know who left.
alter table public.sessions replica identity full;
alter table public.participants replica identity full;
alter table public.courts replica identity full;
alter table public.matches replica identity full;
alter table public.match_players replica identity full;

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.courts;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_players;
