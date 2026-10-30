# Socials, Featured Posts and Partner Page — Design

Status: draft, awaiting review
Date: 2026-10-29
Scope: Growth/Branding (CLAUDE.md §6) — fills out the landing page and gives
brands and event organisers a way to reach the community

## Problem

The landing page is a hero, upcoming sessions and a stats strip. It feels
empty, and it hides the community's most active channels: the community posts
schedules, match photos and videos to its socials, and members join through a
WhatsApp Community and AYO. A visitor also has no way to contact the community
for sponsorship or events beyond guessing at a DM.

This spec delivers:

1. Admin-editable **social links** (Instagram, TikTok, WhatsApp Community, AYO,
   room for more), shown in a "Follow our socials" landing section and in the
   footer.
2. Admin-curated **featured posts**, shown as a carousel on the landing page.
3. A **`/partner`** page with an inquiry form. Inquiries are stored and emailed
   to one inbox; admins triage them on the admin page.

Wording: "Partner" / "Kemitraan" / "Jadi Partner Kami". Never "collab",
"kolaborasi" or "kerja sama".

## Non-goals

- **Live social feeds or oEmbed.** Instagram needs an expiring Meta token and
  AYO has no oEmbed. Admins upload a thumbnail instead.
- **Embedded Instagram/TikTok players.** Heavy third-party scripts, tracking,
  inconsistent styling.
- **Auto-posting to socials.** Same class as WhatsApp automation: 🟢 Future.
- **Replying to inquiries from inside the app.** Admins reply via `mailto:` /
  `wa.me` links; the app only tracks status.
- **CAPTCHA.** Honeypot plus per-IP rate limit first; revisit if spam gets
  through.
- **Sponsor/partner logo strip.** Only once a real partner exists.

## Decisions

| Decision | Choice |
|---|---|
| Social link storage | Row table `social_links`, not columns, so platforms can be added |
| Platforms | `instagram`, `tiktok`, `whatsapp`, `ayo`, `other` (check constraint); `other` requires a label and gets a generic icon |
| Featured post media | Admin-uploaded thumbnail in new public bucket `featured-posts` |
| Landing carousel | 6 newest visible posts by `posted_at` |
| Carousel library | shadcn/ui `Carousel` (Embla), no autoplay |
| Inquiry insert path | Server action with service-role client; no anon table access |
| Spam control | Honeypot field + max 3 inquiries per hashed IP per hour |
| IP storage | Salted SHA-256 hash only (`INQUIRY_IP_SALT`), never the raw IP |
| Inquiry email | Best effort to env `PARTNER_INBOX_EMAIL` via Resend; failure never fails the submit |
| WhatsApp on form | Required |
| Admin UI | Three new sections on the existing single `/admin` page |
| Freshness | Admin writes call `revalidatePath` for `/` and `/partner` in both locales |

## Database

New migration `supabase/migrations/20261029000001_socials_partner.sql`.

### Platform type

```sql
create type public.social_platform as enum ('instagram', 'tiktok', 'whatsapp', 'ayo', 'other');
```

Adding a platform with its own icon later is `alter type ... add value` plus an
icon entry in code. Until then, `other` covers it.

### `social_links`

```sql
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
  constraint social_links_sort_order_key unique (sort_order)
    deferrable initially immediate
);
```

`label` is required for every platform (e.g. "@jakbartwogether",
"WhatsApp Community", "Jakbar Twogether di AYO"), so `other` needs no special
rule.

### `featured_posts`

```sql
create type public.featured_post_kind as enum ('schedule', 'match', 'video', 'other');

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
```

### `partner_inquiries`

```sql
create type public.partner_inquiry_type as enum
  ('sponsorship', 'event', 'brand', 'media', 'other');
create type public.partner_inquiry_status as enum ('new', 'replied', 'closed');

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
```

The zod schema normalises WhatsApp numbers before insert (strip spaces/dashes,
`08…` becomes `+628…`).

All three tables get the existing `set_updated_at` trigger.

### RLS and grants

Pattern follows `20261022000001_about_faq.sql`: revoke all, then grant narrowly.

| Table | anon | authenticated non-admin | admin (`is_admin()`) |
|---|---|---|---|
| `social_links` | select where `is_visible` | select where `is_visible` | select all, insert, update, delete |
| `featured_posts` | select where `is_visible` | select where `is_visible` | select all, insert, update, delete |
| `partner_inquiries` | nothing | nothing | select; update `status` column only |

`partner_inquiries` inserts and `email_sent_at` writes happen only through the
service role. Admins cannot insert or delete inquiries, and cannot edit
anything except `status`.

Reordering social links uses a `reorder_social_links(ids uuid[])` RPC
(`security invoker`, admin check, advisory lock, deferred unique), copying the
FAQ reorder RPC from `20261022000002_faq_rpcs.sql`.

### Storage

Bucket `featured-posts`, public read. Insert/update/delete policies on
`storage.objects` require `is_admin()`. Object path:
`{featured_post_id}/{random}.{ext}`. Allowed types: JPEG, PNG, WebP; max 5 MB,
enforced by bucket config and checked by the server action. Same shape as
`20261021000003_gallery_storage.sql`.

Deleting a featured post deletes its storage object in the same server action:
the row first, then the object. A failed object delete is logged and leaves an
orphan file, which is harmless.

## Server code

### DAL

- `lib/dal/socials.ts`: `listVisibleSocialLinks()`,
  `listLatestFeaturedPosts(limit = 6)`, `listSocialLinksForAdmin()`,
  `listFeaturedPostsForAdmin()`.
- `lib/dal/partner-inquiries.ts`: `listPartnerInquiriesForAdmin(status?)`,
  `countNewPartnerInquiries()`.

### Schemas (`lib/validation/`)

Each schema is the single source of truth for both the client form and the
server action.

- `socialLinkSchema`: platform, url (https), label, is_visible.
- `featuredPostSchema`: platform, post_url, caption_en, caption_id, kind,
  posted_at, is_visible. The image file is validated separately (type and size).
- `partnerInquirySchema`: name, organisation, email, whatsapp (normalised),
  inquiry_type, message, plus `website` honeypot (must be empty).

### Actions

- `lib/actions/socials.ts`: create/update/delete/reorder social links;
  create/update/delete featured posts with image upload. Each calls
  `requireAdmin()`, writes with the user's client (RLS enforces admin), then
  revalidates.
- `lib/actions/partner-inquiry.ts`, `submitPartnerInquiry(input)`:
  1. Parse with `partnerInquirySchema`. If the honeypot is filled, return
     success without inserting (don't tip off bots).
  2. Read the client IP from `x-forwarded-for` (first hop, Vercel sets it) and
     hash it with `INQUIRY_IP_SALT`.
  3. Rate limit: with the service client, count rows for that `ip_hash` in the
     last hour. At 3 or more, return `{ ok: false, code: "rate_limited" }`.
     This check-then-insert can let a burst through by one or two rows. That's
     acceptable for spam control, unlike registration, which is why this does
     not need the atomic-RPC treatment.
  4. Insert with the service client.
  5. Call `sendPartnerInquiryEmail(id)` (best effort, below). Return
     `{ ok: true }` whatever the email outcome.
- `lib/actions/partner-inquiry-admin.ts`, `setPartnerInquiryStatus(id, status)`:
  admin-only, user client, revalidates `/admin`.

### Email

`lib/email/send-partner-inquiry.ts` plus a React Email template
`lib/email/partner-inquiry-email.tsx`. It reuses the claim-then-send pattern
from `send-bump-notifications.ts`: `update ... set email_sent_at = now() where
id = $1 and email_sent_at is null`, then send, and release the claim on
failure. It never throws. Subject: `New partner inquiry: {organisation}
({type})`. The body has every field, plus reply links (`mailto:`, `wa.me`) and
a link to `/admin`. `reply_to` is set to the inquirer's email.

If `PARTNER_INBOX_EMAIL` is unset, it skips sending and logs a warning. The
inquiry still shows in the admin inbox, and inquiries left with
`email_sent_at` null mark the ones that were never emailed.

### Revalidation

`lib/socials/revalidate.ts` exports `revalidateSocialSurfaces()`, which calls
`revalidatePath` for `/[locale]` and `/[locale]/partner` with the `page`
type, following the pattern in `lib/gallery/revalidate.ts`. The footer lives
in the marketing layout, so revalidating the pages covers it as well.

## UI

### Shared

- `components/marketing/social-icon.tsx`: maps `social_platform` to an inline
  SVG (Instagram, TikTok, WhatsApp, AYO; generic link icon for `other`).
  `aria-hidden`; the visible label carries the meaning.
- `components/ui/carousel.tsx`: added via `npx shadcn@latest add carousel`
  (pulls in `embla-carousel-react`).

### Landing page (`app/[locale]/(marketing)/page.tsx`)

New order:

1. Hero (unchanged)
2. Upcoming sessions (unchanged)
3. Community stats (unchanged)
4. **From our socials** (`FeaturedPostsCarousel`, client component): up to 6
   square cards, each with a `next/image` thumbnail, a kind badge, a platform
   icon and the locale's caption. The whole card is a link to `post_url`
   (`target="_blank" rel="noopener noreferrer"`). On mobile, about 85% slide
   width so the next card peeks in; on desktop, 3 per view with prev/next
   buttons. No autoplay. Hidden when there are no visible posts.
5. Announcements (unchanged)
6. **Follow our socials** (`SocialLinksSection`): a grid of large tappable
   cards (44px or more), each with an icon, the label and a verb that fits the
   platform ("Follow" for Instagram/TikTok, "Join" for WhatsApp/AYO, "Visit"
   for `other`). Hidden when there are no visible links.
7. **Partner CTA band**: heading, one line of text and a button to `/partner`.
   Uses a different surface token from the cork sign-up band below it, so the
   two bands stay visually distinct.
8. Sign-up band (unchanged)

### Marketing layout

- Header nav: add `{ href: "/partner", label: t("nav.partner") }` after FAQ.
- Footer: a row of social icon links (from `listVisibleSocialLinks()`, each
  with `aria-label` = label) and a "Partner with us" link in the footer nav.

### `/partner` page (`app/[locale]/(marketing)/partner/page.tsx`)

- `revalidate = 60`, like its sibling pages. `generateMetadata` gives a
  localised title and description, plus an OG image (the existing default).
- Sections: hero ("Partner with us" / "Jadi Partner Kami"), then 4 offer tiles
  that match the inquiry types (copy in `messages/`), then the stats strip
  (reused, same visibility rule), then `PartnerInquiryForm`, then "Or reach us
  directly" listing the social links.
- `PartnerInquiryForm` (client): react-hook-form with `partnerInquirySchema`
  and shadcn Form/Input/Select/Textarea. The honeypot is visually hidden
  (`aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`). On success the form
  is replaced by a thank-you panel. The rate-limited response and general
  errors appear as inline messages, translated.
- Added to `app/sitemap.ts` with `id`/`en` alternates.

### Admin (`app/(app)/admin/page.tsx`)

Three new sections, placed after FAQ, in English like the rest of admin:

- **Social links** (`components/admin/social-links-editor.tsx`): rows with an
  icon, label, URL, visibility toggle, up/down reorder, edit dialog and delete
  confirmation. Modelled on `FaqEditor`.
- **Featured posts** (`components/admin/featured-posts-editor.tsx`): a
  thumbnail grid with a visibility badge. A create/edit dialog takes the image
  file (required on create, optional on edit, which replaces the old image),
  URL, platform, kind, both captions, posted date and visibility. Delete has a
  confirmation.
- **Partner inquiries** (`components/admin/partner-inquiries-table.tsx`):
  newest first, a status filter (All / New / Replied / Closed) and a "N new"
  badge in the section header. Each row shows the date, name, organisation,
  type, a message preview (expandable), `mailto:` and `wa.me` links, and a
  status `Select`. A small marker shows when the email was not sent
  (`email_sent_at` null).

### i18n

New keys in `messages/id.json` and `messages/en.json`: `nav.partner`,
`footer.partner`, `footer.socials`, `home.featuredTitle`/`Body`,
`home.socialsTitle`/`Body`, `home.partnerCtaTitle`/`Body`/`Button`, and a
`partner` namespace (hero, offers, form labels, validation messages, success,
rate limit, errors). Social verbs go under `socials.follow`/`join`/`visit`.
Every string needs both languages.

## Environment

| Var | Where | Purpose |
|---|---|---|
| `PARTNER_INBOX_EMAIL` | Vercel (prod + preview), `.env.local` | Inquiry email recipient |
| `INQUIRY_IP_SALT` | Vercel (prod + preview), `.env.local` | Salt for `ip_hash` |

Add both to `.env.example`. `RESEND_API_KEY` and the sender address already
exist.

## Testing

- **pgTAP** (`supabase/tests/`):
  - anon and non-admin users cannot select/insert/update/delete
    `partner_inquiries`
  - anon sees only visible `social_links`/`featured_posts` and cannot write
    them
  - an admin can update only `status` on inquiries
  - the storage policies on `featured-posts` let only admins write
  - the check constraints reject `http://` URLs and bad WhatsApp numbers
- **Unit** (`tests/unit/`):
  - `partnerInquirySchema`: WhatsApp normalisation and the honeypot
  - `submitPartnerInquiry`, with an injected client and Resend: a filled
    honeypot returns ok with no insert; the 4th submit in an hour is
    rate-limited; a Resend failure still returns ok and leaves
    `email_sent_at` null
  - `sendPartnerInquiryEmail`: claim/release, and no send when the env var is
    unset
  - the sitemap includes `/partner`
- **Manual**: at phone width (375px) and desktop, in both locales, check:
  - carousel swipe and buttons
  - the form's validation, success and rate-limit states
  - the footer icons and keyboard focus order
  - with reduced motion on, no animation beyond Embla's drag

After the migration: `supabase gen types typescript` to regenerate
`types/supabase.ts`.

## Future-tier notes

- **Auto-posting to socials** (🟢 Future) would need stored OAuth tokens for
  each platform. Nothing here blocks it, but `featured_posts` would then need a
  `source` column to separate manual posts from synced ones.
- **Live feeds**: if ever wanted, a sync job could fill `featured_posts` from
  the Instagram Graph API. The table shape already fits; only `image_path`
  would need to point to a copied image.
