-- Local development seed. Never runs against production: `supabase db reset`
-- and `supabase start` are local-only commands.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@jakbar.local'),
  ('00000000-0000-0000-0000-00000000b001', 'host@jakbar.local'),
  ('00000000-0000-0000-0000-00000000c001', 'member@jakbar.local')
on conflict (id) do nothing;

-- auth.uid() is null here, so the role guard permits the bootstrap.
update public.profiles set role = 'admin', full_name = 'Local Admin'
 where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'host', full_name = 'Local Host'
 where id = '00000000-0000-0000-0000-00000000b001';
update public.profiles set full_name = 'Local Member'
 where id = '00000000-0000-0000-0000-00000000c001';

insert into public.sessions
  (title, starts_at, ends_at, location, court_count, max_participants,
   waitlist_capacity, created_by, status, registration_state)
values
  ('Friday Night Badminton',
   now() + interval '3 days', now() + interval '3 days 3 hours',
   'GOR Jakarta Barat', 4, 16, 4,
   '00000000-0000-0000-0000-00000000b001', 'scheduled', 'open');
