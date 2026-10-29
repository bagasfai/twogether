# Jakbar Twogether

Badminton community operations platform for the Jakarta Barat (West Jakarta) community. It replaces WhatsApp threads, Google Forms and spreadsheets for running open-play sessions, and doubles as the community's public website.

- **Operations platform** — create a session, open registration, manage participants and the waitlist, check players in, manage courts, schedule matches, rotate players, close the session, archive history.
- **Public website** — landing page, upcoming sessions, gallery, about, FAQ and partner inquiry. Bilingual (Indonesian default, English), SEO-oriented.

Product context lives in [`PRODUCT.md`](PRODUCT.md), design direction in [`design.md`](design.md), and project conventions in [`CLAUDE.md`](CLAUDE.md).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Backend | Supabase: Postgres, Auth, Realtime, Storage, RLS |
| UI | Tailwind CSS 4, shadcn/ui, Radix |
| Forms / validation | react-hook-form + zod |
| i18n | next-intl (`id` default, `en`) |
| Email | Resend + React Email |
| Language | TypeScript (strict) |
| Tests | Vitest (unit), pgTAP (database), shell scripts (concurrency) |
| Deployment | Vercel (app) + Supabase Cloud (backend) |

## Architecture

- **Route groups.** `app/[locale]/(marketing)` is the public, SEO-focused site. `app/(app)` holds the member, host and admin dashboards. `app/(auth)` holds login and signup.
- **Mutations.** Server Actions for standard CRUD. Supabase Realtime plus client calls for live state (check-in, courts, matches, waitlist).
- **Registration is atomic.** The confirmed / waitlisted / full decision is a single Postgres function called through `supabase.rpc()`. Waitlist promotion on cancellation is a Postgres trigger, so it behaves the same for member cancellations and host overrides.
- **RLS is the authorization layer.** Role checks live in row-level security policies. Middleware and UI gating are UX conveniences only.
- **Roles.** Visitor, Member, Host, Admin.
- **Checked-in players are a separate pool** from registered participants. Courts, matches and rotation operate on the checked-in pool.

## Getting started

### Prerequisites

- Node.js 22+
- npm
- Docker (for the local Supabase stack)

### Setup

```bash
npm install
cp .env.example .env.local     # then fill in values, see below
npx supabase start             # boot Postgres, Auth, Realtime, Studio
npx supabase db reset          # apply all migrations + seed
npm run dev
```

Open <http://127.0.0.1:3000>. Use `127.0.0.1`, not `localhost`: local Supabase is configured for that host and auth redirects are rejected otherwise.

### Environment variables

Copy `.env.example` to `.env.local`. Read local Supabase values with `npx supabase status -o env`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key; RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, bypasses RLS, never expose to the client |
| `RESEND_API_KEY` | Server-only. Also set on the `send-email` edge function via `supabase secrets set` |
| `RESEND_EMAIL_DOMAIN` | Verified Resend domain, no scheme. Mail is sent from `no-reply@<domain>` |
| `NEXT_PUBLIC_SITE_URL` | Public origin for auth redirects. Must match `supabase/config.toml` `site_url` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET` | Google OAuth. Leave blank until credentials exist; provider is disabled in `config.toml` |
| `PARTNER_INBOX_EMAIL` | Inbox for partner inquiries. Blank skips emailing; inquiries still show in `/admin` |
| `INQUIRY_IP_SALT` | Required. Salt for hashing inquiry IPs for rate limiting (`openssl rand -hex 32`) |

### Local ports

Local Supabase ports are remapped to the 5433x block so it can run next to other Supabase projects: API `54331`, DB `54332`, Studio `54333`. Do not hardcode them; read the live values with `npx supabase status -o env`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest, single run |
| `npm run test:unit:watch` | Vitest, watch mode |

## Database

The schema, RLS policies and registration RPCs live in `supabase/migrations/`. For the reasoning behind the shape, see [`docs/superpowers/specs/2026-09-11-core-schema-rls-design.md`](docs/superpowers/specs/2026-09-11-core-schema-rls-design.md). Known gaps are tracked in [`docs/superpowers/core-schema-follow-ups.md`](docs/superpowers/core-schema-follow-ups.md).

```bash
npx supabase test db                       # pgTAP suite (supabase/tests)
./scripts/test-concurrent-registration.sh  # prove registration is race-safe
```

Other concurrency checks live in `scripts/` (`test-concurrent-create-match.sh`, `test-concurrent-drilling.sh`, `test-concurrent-gallery-photos.sh`, `test-concurrent-faq-order.sh`).

After any schema change, regenerate the types:

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

### First admin

`profiles.role` defaults to `member`, and only an admin can change a role. There is deliberately no "first user becomes admin" rule: on a public signup form that would be a privilege-escalation path.

Sign up normally, then run once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```

The role-change guard exempts calls where `auth.uid()` is null, which covers the SQL editor and any `service_role` connection.

## Deployment

The app deploys to Vercel and the backend to Supabase Cloud.

1. Push all migrations to the hosted project and confirm `types/supabase.ts` matches it.
2. Deploy the `send-email` edge function (`--no-verify-jwt`) and set its secrets (`RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN`, `SEND_EMAIL_HOOK_SECRET`).
3. In the Supabase dashboard: enable the Auth Send Email hook, set the Site URL and redirect allow-list, and check the gallery storage bucket.
4. Set Vercel environment variables to hosted values, including `NEXT_PUBLIC_SITE_URL`. Local values in Production break the build at `/sitemap.xml`.
5. Create the first admin (see above).

## Scope

Work is tiered: **Core** (auth, sessions, registration, waitlist, check-in, courts, matches, rotation, live dashboard), **Important** (announcements, WhatsApp sharing, history, payment and no-show tracking), **Growth** (marketing site), **Future** (tournaments, payment gateway, WhatsApp automation). WhatsApp is offloaded, not replaced: share and copy features are in scope, bot automation is not.
