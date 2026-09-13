@AGENTS.md

# Jakbar Twogether — Claude Project Instructions

You are helping build **Jakbar Twogether**, a badminton community operations platform. Use this document as persistent context for every conversation in this project. When in doubt about scope or approach, default to what's written here rather than asking to re-establish context.

---

## 1. What This Product Is

Jakbar Twogether replaces manual, WhatsApp/Google Forms/spreadsheet-based badminton session management with a structured platform. It has two halves:

1. **Operations platform** — hosts run a full session lifecycle: create session → open registration → manage participants/waitlist → check in players → manage courts → schedule matches → manage rotation → close session → archive history.
2. **Public website** — community's digital identity: landing page, about, gallery, FAQ, SEO-driven member acquisition.

The operations half is the actual product. The public site is secondary but still required.

**Core problems being solved** (keep these in mind when making design decisions — every feature should trace back to one of these):
- Participant lists getting overwritten/lost in WhatsApp threads
- Manual, race-condition-prone registration ("who registered first")
- Manual waitlist tracking and promotion
- No single source of truth for participant data
- Manual court/match/rotation tracking during live sessions

---

## 2. Locked Tech Stack

Do not suggest alternatives to these unless I explicitly ask for a reevaluation:

| Layer | Choice |
|---|---|
| Framework | Next.js, App Router |
| Backend/DB | Supabase (Postgres, Auth, Realtime, Storage, RLS) |
| UI | Tailwind CSS + shadcn/ui |
| Forms/validation | react-hook-form + zod |
| Language | TypeScript, strict mode |
| Email | Resend + React Email |
| Deployment | Vercel (app) + Supabase Cloud (backend) |
| Type generation | `supabase gen types typescript` — no separate ORM unless we decide we need one later |

**Rendering split:**
- `(marketing)` route group — landing, about, gallery, FAQ, upcoming sessions preview → SSG/ISR, optimized for SEO
- `(app)` route group — member/host/admin dashboards → client-heavy, realtime-driven

**Mutation pattern:**
- Server Actions for standard CRUD (create session, edit profile, post announcement)
- Supabase Realtime channels + client-side calls for anything live (check-in state, court status, match progress, waitlist count)

---

## 3. Non-Negotiable Architecture Rules

These come directly from stated requirements in the product brief — don't let convenience-of-implementation override them.

1. **Registration and waitlist logic must be concurrency-safe.** The brief explicitly requires the system to "safely handle situations where multiple users attempt to register at nearly the same time." This means:
   - Registration decision (confirmed / waitlisted / full) must be a single atomic operation — a Postgres function called via `supabase.rpc()`, not a client-side "check count, then insert."
   - Waitlist promotion on cancellation must be a Postgres trigger on participant status change, not application-layer logic — so it fires consistently whether the cancellation comes from a member or a host override.

2. **Row Level Security is the real authorization layer**, not a formality. Role checks belong in RLS policies first; middleware/UI-level role gating is a UX convenience on top, not the enforcement mechanism.

3. **Hosts always retain manual override capability.** Every automated flow (waitlist promotion, status assignment) needs a corresponding host-facing manual control. Don't design any operational feature as automation-only.

4. **Checked-in players are a distinct pool from registered participants.** Court assignment, match scheduling, and rotation operate on the checked-in pool, not the registration list. Don't conflate these.

5. **WhatsApp is not being replaced**, only offloaded. Features like "share event link," "copy participant list," "copy session summary" are in scope; WhatsApp Bot/API automation is explicitly out of MVP scope (cost/complexity, deferred to Future tier).

---

## 4. Roles & Permissions (for RLS design)

| Role | Can do |
|---|---|
| **Visitor** | View public site: sessions, gallery, about, FAQ. No account. |
| **Member** | Register/cancel for sessions, view own registration status & waitlist position, view own session history. |
| **Host** | Full session lifecycle management for sessions they own/co-host: create/edit sessions, manage participants (including manual add/remove/override), check-in, court management, match scheduling, rotation, live dashboard. |
| **Admin** | Everything a Host can do, plus: manage members, manage hosts, manage all sessions, manage community info/galleries/announcements, platform settings. |

When building any feature, identify which of these four roles touches it and what RLS policy that implies before writing UI.

---

## 5. Core Data Model

The schema is built. Read it from the source of truth rather than from a summary
here — a summary drifts, and this one already had: it described `participants.checked_in`
as a bool when the column is `checked_in_at timestamptz`, omitted `session_hosts`
entirely, and listed `phone` on `profiles` after it moved to `profiles_private`.

- `supabase/migrations/` — the DDL, RLS policies, and registration RPCs
- `types/supabase.ts` — generated types, regenerated after every schema change
- `docs/superpowers/specs/2026-09-11-core-schema-rls-design.md` — why the schema is shaped this way
- `docs/superpowers/core-schema-follow-ups.md` — known gaps, triaged

Payment status and no-show tracking are additive fields/tables for the "Important" tier — don't build a payment gateway integration; MVP is manual status tracking only.

---

## 6. Scope Discipline — Build in This Order

**🔴 Core (build first, this is "the foundation"):**
Auth, roles, session management, participant registration, participant management, automatic + manual waitlist handling, check-in, court management, match scheduling, player rotation, live session dashboard, realtime updates.

**🟠 Important (after Core works end-to-end):**
Operational dashboard, WhatsApp sharing (copy/share, not automation), session history, announcements, payment status tracking (manual), no-show tracking.

**🔵 Growth/Branding (can run in parallel, lower engineering risk):**
Landing page, about page, gallery, FAQ, SEO, community stats.

**🟢 Future (do not build unless explicitly asked):**
Automatic match generation, automatic rotation, skill balancing, tournaments, payment gateway integration, WhatsApp automation.

If a request seems to reach into 🟢 Future territory, flag it rather than quietly building it — the brief treats these as deferred until Core is validated.

---

## 7. How I Want You to Work With Me

- Default to **Server Actions + RLS** as the boilerplate pattern; only reach for Route Handlers or client-side Supabase calls when realtime or streaming is actually needed.
- When a feature touches registration or waitlist state, **always** default to writing it as a Postgres function/trigger and explain the concurrency reasoning — don't silently write check-then-write app logic.
- Generate Supabase types from schema rather than hand-maintaining interfaces; remind me to regenerate after schema changes.
- Use zod schemas as the single source of truth for both client-side form validation and server-side input validation on the same entity.
- Favor shadcn/ui primitives composed together over custom-built components unless something genuinely isn't covered.
- When scope is ambiguous, check it against the tier table in Section 6 before proposing an approach.
- Call out any place where a decision here (schema, RLS policy, role boundary) would need to change to support a 🟢 Future feature later — I'd rather know the cost now than get surprised.
