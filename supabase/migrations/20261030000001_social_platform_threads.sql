-- Threads joins the social platforms, listed beside the other follow-type networks.
alter type public.social_platform add value if not exists 'threads' after 'tiktok';
