-- Removes everything demo-seed.sql created, plus anything the demo accounts
-- did during the presentation (registrations, guests, matches in demo
-- sessions, uploaded-photo rows). About/FAQ rows are left alone: the seed only
-- wrote them into empty tables, so they may now be your real content.
--
-- Photos uploaded during the demo also live in Storage; delete those files
-- from the gallery bucket in the dashboard if you uploaded any.

begin;

-- Matches go before sessions: guard_court_delete refuses to drop a court that
-- still has an active match, which a session cascade would try to do.
delete from public.matches
 where session_id::text like 'de0005e5-%'
    or session_id in (select id from public.sessions
                       where created_by in (select id from auth.users where email like '%@twogether.demo'));

-- Sessions next: courts, match_players and participants cascade.
-- Albums only get session_id set null on delete, so remove them explicitly.
delete from public.gallery_photos
 where gallery_id in (select id from public.galleries where session_id::text like 'de0005e5-%');
delete from public.galleries where session_id::text like 'de0005e5-%';
delete from public.announcements where session_id::text like 'de0005e5-%';
delete from public.sessions where id::text like 'de0005e5-%';

-- Anything the demo accounts created outside the demo sessions.
delete from public.announcements
 where created_by in (select id from auth.users where email like '%@twogether.demo');
delete from public.participants
 where user_id in (select id from auth.users where email like '%@twogether.demo')
    or registered_by in (select id from auth.users where email like '%@twogether.demo');
delete from public.sessions
 where created_by in (select id from auth.users where email like '%@twogether.demo');

delete from public.membership_plans where id::text like 'de00b1a0-%';

-- profiles, profiles_private, member_levels, memberships cascade from here.
delete from auth.users where email like '%@twogether.demo';

commit;
