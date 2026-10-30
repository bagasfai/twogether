create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_community_idx
  on public.announcements (published_at desc)
  where session_id is null;

create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete set null,
  title text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger galleries_set_updated_at
before update on public.galleries
for each row execute function public.set_updated_at();

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index gallery_photos_order_idx
  on public.gallery_photos (gallery_id, sort_order);
