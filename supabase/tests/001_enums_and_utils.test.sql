begin;
select plan(9);

select has_type('public', 'user_role', 'user_role enum exists');
select enum_has_labels('public', 'user_role', array['member','host','admin']);
select enum_has_labels('public', 'session_status', array['draft','scheduled','live','completed','cancelled']);
select enum_has_labels('public', 'registration_state', array['closed','open']);
select enum_has_labels('public', 'participant_status', array['confirmed','waiting_list','cancelled']);
select enum_has_labels('public', 'session_host_role', array['owner','cohost']);
select enum_has_labels('public', 'court_status', array['idle','in_use','unavailable']);
select enum_has_labels('public', 'match_status', array['scheduled','in_progress','completed','cancelled']);
select has_function('public', 'set_updated_at', 'set_updated_at() exists');

select * from finish();
rollback;
