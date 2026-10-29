-- Socials, featured posts and partner inquiries
-- (docs/superpowers/specs/2026-10-29-socials-partner-design.md, "Database").
--
-- Authorization is RLS plus narrow grants, following 20261022000001_about_faq.sql:
--   social_links      public read of visible rows; admin reads all and updates
--                     platform/url/label/is_visible directly. Create, reorder
--                     and delete go through the social_link_* RPCs only,
--                     because they read-then-write sort_order.
--   featured_posts    public read of visible rows; admin insert/update/delete.
--   partner_inquiries nothing for anon. authenticated holds SELECT and
--                     UPDATE (status) only, and RLS limits both to admins.
--                     Inserts and email_sent_at writes use the service role.
-- Hosts are deliberately not admins here.
--
-- Deviation from the spec, decided while planning: reordering uses
-- social_link_move(p_id, p_direction), copying faq_move, instead of
-- reorder_social_links(ids uuid[]).
--
-- Admin checks call public.is_admin(), which anon cannot execute, so every
-- admin policy targets authenticated only and the public-read policies never
-- call it.

-- ---- types ----

create type public.social_platform as enum ('instagram', 'tiktok', 'whatsapp', 'ayo', 'other');
create type public.featured_post_kind as enum ('schedule', 'match', 'video', 'other');
create type public.partner_inquiry_type as enum
  ('sponsorship', 'event', 'brand', 'media', 'other');
create type public.partner_inquiry_status as enum ('new', 'replied', 'closed');

-- ---- social_links ----

create table public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform public.social_platform not null,
  url text not null
    check (url ~ '^https://' and char_length(url) <= 500),
  label text not null
    check (length(btrim(label, E' \t\r\n')) > 0 and char_length(label) <= 80),
  sort_order integer not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so a reorder can swap two values in one UPDATE statement.
  constraint social_links_sort_order_key unique (sort_order)
    deferrable initially immediate
);

create trigger social_links_set_updated_at
before update on public.social_links
for each row execute function public.set_updated_at();

-- Advisory-lock key serialising social link create/move/delete in the RPCs.
create function public.social_links_lock_key()
returns bigint
language sql
immutable
as $$ select hashtextextended('social_links', 0) $$;

-- Only the security definer RPCs below call it.
revoke execute on function public.social_links_lock_key() from public, anon, authenticated;

-- ---- featured_posts ----

create table public.featured_posts (
  id uuid primary key default gen_random_uuid(),
  platform public.social_platform not null,
  post_url text not null
    check (post_url ~ '^https://' and char_length(post_url) <= 500),
  image_path text not null,
  caption_en text not null
    check (length(btrim(caption_en, E' \t\r\n')) > 0 and char_length(caption_en) <= 200),
  caption_id text not null
    check (length(btrim(caption_id, E' \t\r\n')) > 0 and char_length(caption_id) <= 200),
  kind public.featured_post_kind not null,
  posted_at date not null default (now() at time zone 'Asia/Jakarta')::date,
  is_visible boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index featured_posts_visible_posted_idx
  on public.featured_posts (posted_at desc, created_at desc)
  where is_visible;

create trigger featured_posts_set_updated_at
before update on public.featured_posts
for each row execute function public.set_updated_at();

-- ---- partner_inquiries ----

create table public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  organisation text not null check (char_length(btrim(organisation)) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp text not null check (whatsapp ~ '^\+?[0-9]{8,15}$'),
  inquiry_type public.partner_inquiry_type not null,
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status public.partner_inquiry_status not null default 'new',
  ip_hash text not null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_inquiries_ip_recent_idx
  on public.partner_inquiries (ip_hash, created_at desc);
create index partner_inquiries_status_created_idx
  on public.partner_inquiries (status, created_at desc);

create trigger partner_inquiries_set_updated_at
before update on public.partner_inquiries
for each row execute function public.set_updated_at();

-- ---- RLS and grants ----

alter table public.social_links enable row level security;
alter table public.featured_posts enable row level security;
alter table public.partner_inquiries enable row level security;

revoke all on public.social_links from anon, authenticated;
revoke all on public.featured_posts from anon, authenticated;
revoke all on public.partner_inquiries from anon, authenticated;

grant select on public.social_links to anon, authenticated;
grant update (platform, url, label, is_visible)
  on public.social_links to authenticated;

grant select on public.featured_posts to anon, authenticated;
grant insert (platform, post_url, image_path, caption_en, caption_id, kind,
              posted_at, is_visible, created_by)
  on public.featured_posts to authenticated;
grant update (platform, post_url, image_path, caption_en, caption_id, kind,
              posted_at, is_visible)
  on public.featured_posts to authenticated;
grant delete on public.featured_posts to authenticated;

grant select on public.partner_inquiries to authenticated;
grant update (status) on public.partner_inquiries to authenticated;

-- social_links

create policy social_links_select_visible on public.social_links
  for select to anon, authenticated using (is_visible);

create policy social_links_select_admin on public.social_links
  for select to authenticated using (public.is_admin());

create policy social_links_update on public.social_links
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- featured_posts

create policy featured_posts_select_visible on public.featured_posts
  for select to anon, authenticated using (is_visible);

create policy featured_posts_select_admin on public.featured_posts
  for select to authenticated using (public.is_admin());

create policy featured_posts_insert on public.featured_posts
  for insert to authenticated
  with check (public.is_admin());

create policy featured_posts_update on public.featured_posts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy featured_posts_delete on public.featured_posts
  for delete to authenticated
  using (public.is_admin());

-- partner_inquiries

create policy partner_inquiries_select on public.partner_inquiries
  for select to authenticated using (public.is_admin());

create policy partner_inquiries_update on public.partner_inquiries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- social_link_* RPCs ----
-- Copy of the FAQ RPCs (20261022000002_faq_rpcs.sql) with an empty
-- search_path. Create, move and delete all read-then-write sort_order, so
-- each takes the same advisory lock after its guards: concurrent admins
-- serialise instead of computing the same max()+1 or the same neighbour.
--   JB006 wrong transaction isolation
--   JB007 not authorized
--   JB008 not found
--   JB011 invalid input (direction)
-- Bad url or label surfaces as the table's check violation 23514.

create function public.social_link_create(
  p_platform public.social_platform,
  p_url text,
  p_label text,
  p_is_visible boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'social_link_create requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.social_links_lock_key());

  insert into public.social_links (platform, url, label, is_visible, sort_order)
  select p_platform, p_url, p_label, p_is_visible,
         coalesce(max(sort_order), 0) + 1
    from public.social_links
  returning id into v_id;

  return v_id;
end;
$$;

create function public.social_link_move(p_id uuid, p_direction text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order integer;
  v_neighbour_id uuid;
  v_neighbour_order integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'social_link_move requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.social_links_lock_key());

  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = 'JB011';
  end if;

  select sort_order into v_order from public.social_links where id = p_id;
  if not found then
    raise exception 'social link not found' using errcode = 'JB008';
  end if;

  if p_direction = 'up' then
    select id, sort_order into v_neighbour_id, v_neighbour_order
      from public.social_links
     where sort_order < v_order
     order by sort_order desc
     limit 1;
  else
    select id, sort_order into v_neighbour_id, v_neighbour_order
      from public.social_links
     where sort_order > v_order
     order by sort_order asc
     limit 1;
  end if;

  -- Already at the edge: nothing to swap.
  if v_neighbour_id is null then
    return;
  end if;

  -- One statement; the unique constraint is deferrable so the transient
  -- duplicate inside the swap is checked only at statement end.
  update public.social_links
     set sort_order = case id
           when p_id then v_neighbour_order
           else v_order
         end
   where id in (p_id, v_neighbour_id);
end;
$$;

create function public.social_link_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'social_link_delete requires read committed isolation, got %',
      current_setting('transaction_isolation') using errcode = 'JB006';
  end if;

  if not public.is_admin() then
    raise exception 'not authorized' using errcode = 'JB007';
  end if;

  perform pg_advisory_xact_lock(public.social_links_lock_key());

  delete from public.social_links where id = p_id returning sort_order into v_deleted;
  if not found then
    raise exception 'social link not found' using errcode = 'JB008';
  end if;

  update public.social_links
     set sort_order = sort_order - 1
   where sort_order > v_deleted;
end;
$$;

revoke execute on function public.social_link_create(public.social_platform, text, text, boolean)
  from public, anon;
revoke execute on function public.social_link_move(uuid, text) from public, anon;
revoke execute on function public.social_link_delete(uuid) from public, anon;
grant execute on function public.social_link_create(public.social_platform, text, text, boolean)
  to authenticated;
grant execute on function public.social_link_move(uuid, text) to authenticated;
grant execute on function public.social_link_delete(uuid) to authenticated;

-- ---- storage: featured-posts bucket ----
-- Same shape as 20261021000003_gallery_storage.sql. Public reads go through
-- the bucket's public URL and need no policy. Objects sit at '{uuid}.{ext}'
-- (no folder); the server action checks the path shape. Writes are
-- admin-only. featured_posts_storage_select exists because storage-api
-- removes and updates objects with a DELETE/UPDATE whose WHERE only reaches
-- rows that also pass a SELECT policy (see the gallery migration header); it
-- is admin-only, so anon and members still cannot list the bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'featured-posts',
  'featured-posts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy featured_posts_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'featured-posts' and public.is_admin());

create policy featured_posts_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'featured-posts' and public.is_admin());

create policy featured_posts_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'featured-posts' and public.is_admin())
  with check (bucket_id = 'featured-posts' and public.is_admin());

create policy featured_posts_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'featured-posts' and public.is_admin());
