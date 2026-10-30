-- About and FAQ content (docs/superpowers/specs/2026-10-22-about-faq-design.md).
-- Public read, admin-only write. Authorization is RLS plus column grants:
-- authenticated gets UPDATE on text columns only, never INSERT/DELETE, so
-- rows exist only via this migration (About) or service-role/RPC paths (FAQ).
-- Hosts are deliberately not admins here.

-- ---- community_about (single row) ----

create table public.community_about (
  id boolean primary key default true check (id),
  title_en text not null
    check (length(btrim(title_en, E' \t\r\n')) > 0 and char_length(title_en) <= 120),
  title_id text not null
    check (length(btrim(title_id, E' \t\r\n')) > 0 and char_length(title_id) <= 120),
  body_en text not null
    check (length(btrim(body_en, E' \t\r\n')) > 0 and char_length(body_en) <= 8000),
  body_id text not null
    check (length(btrim(body_id, E' \t\r\n')) > 0 and char_length(body_id) <= 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create trigger community_about_set_updated_at
before update on public.community_about
for each row execute function public.set_updated_at();

-- ---- faq_items ----

create table public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question_en text not null
    check (length(btrim(question_en, E' \t\r\n')) > 0 and char_length(question_en) <= 200),
  question_id text not null
    check (length(btrim(question_id, E' \t\r\n')) > 0 and char_length(question_id) <= 200),
  answer_en text not null
    check (length(btrim(answer_en, E' \t\r\n')) > 0 and char_length(answer_en) <= 4000),
  answer_id text not null
    check (length(btrim(answer_id, E' \t\r\n')) > 0 and char_length(answer_id) <= 4000),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so a reorder can swap two values in one UPDATE statement.
  constraint faq_items_sort_order_key unique (sort_order)
    deferrable initially immediate
);

create trigger faq_items_set_updated_at
before update on public.faq_items
for each row execute function public.set_updated_at();

-- Advisory-lock key serialising FAQ create/reorder/delete in later RPCs.
create function public.faq_lock_key()
returns bigint
language sql
immutable
as $$ select hashtextextended('faq_items', 0) $$;

-- ---- RLS and grants ----

alter table public.community_about enable row level security;
alter table public.faq_items enable row level security;

revoke all on public.community_about from anon, authenticated;
revoke all on public.faq_items from anon, authenticated;

grant select on public.community_about to anon, authenticated;
grant select on public.faq_items to anon, authenticated;

grant update (title_en, title_id, body_en, body_id, updated_by)
  on public.community_about to authenticated;
grant update (question_en, question_id, answer_en, answer_id)
  on public.faq_items to authenticated;

create policy community_about_select on public.community_about
  for select to anon, authenticated using (true);

create policy faq_items_select on public.faq_items
  for select to anon, authenticated using (true);

create policy community_about_update on public.community_about
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy faq_items_update on public.faq_items
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- seed ----

-- Placeholder copy: an admin replaces it from the dashboard.
insert into public.community_about (title_en, title_id, body_en, body_id)
values (
  'About our community',
  'Tentang komunitas kami',
  'Placeholder: this text is replaced by an admin. Tell visitors who we are, where we play and how to join.',
  'Placeholder: teks ini akan diganti oleh admin. Ceritakan siapa kami, di mana kami bermain, dan cara bergabung.'
);
