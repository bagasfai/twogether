# Product

<!-- impeccable:product-schema 1 -->

<!-- Init was run unattended: the user was not available for the interview.
Facts below come from the repo (CLAUDE.md, messages/, routes) and the user's
stated brief (tone: playful sporty; audience; use case). Inferences are labelled. -->

## Platform

web

## Users
Members of the Jakarta Barat (West Jakarta) badminton community, plus first-time visitors who found a session link in a WhatsApp group or via search. Primary job: find the next session and register for a spot (confirmed or waitlisted) in under a minute, usually on a phone. Hosts and admins use the (app) dashboard; they are out of scope for the marketing surface. (Audience and job stated by the user.)

## Product Purpose
Jakbar Twogether replaces WhatsApp threads, Google Forms and spreadsheets for running badminton open-play sessions: concurrency-safe registration, waitlist, check-in, courts, matches, rotation. The public marketing site is the community's front door: upcoming sessions, gallery, about, FAQ, and member acquisition via SEO. Success: a visitor registers for a session, and a newcomer understands the community is friendly and easy to join.

## Positioning
A community-first badminton platform for one neighbourhood: sessions are real, local, and run by hosts who know the players. A generic booking app cannot claim the West Jakarta community identity or the live session tooling behind the registration page.

## Operating Context
Bilingual (Indonesian default, English under /en) via next-intl. Visitors arrive on mobile from WhatsApp links; pages are ISR-cached public routes. Session and album links are pasted into WhatsApp, so link previews matter. Times are Asia/Jakarta.

## Capabilities and Constraints
- Marketing routes: landing, about, gallery, gallery/[id], faq, sessions, sessions/[id]. Registration happens on the session detail page (RegisterPanel).
- Stack locked: Next.js App Router, Tailwind v4, shadcn/ui, Supabase. Content for about/FAQ is admin-edited; copy exists in messages/.
- WhatsApp is not replaced, only offloaded (share/copy features).
- Shared tokens must not break (app)/(auth) screens.

## Brand Commitments
Name: Jakbar Twogether. Logo: public/brand/jakbar-twogether.jpeg, a bright sky-blue photo with a glossy white script wordmark outlined in navy and four shuttlecocks. Tone: playful, sporty (stated by user). Wordmark is a raster image, square, with sky background (no transparent version exists).

## Evidence on Hand
Real: the logo image; session data, albums and photos from Supabase; admin-authored about and FAQ content; community stats (shown only when meaningful). Absent, must not be fabricated: testimonials, member counts, press, photos of play in the repo, prices.

## Product Principles
1. The next action (see sessions, register) is always one tap away.
2. Local and human: the community is the product; the site should feel like a sports club, not a SaaS tool.
3. Honest content only: show real sessions, real photos, real stats or nothing.
4. Fast on a phone and readable in daylight on a court-side screen.
5. Both languages are first-class; layouts survive Indonesian and English string lengths.

## Accessibility & Inclusion
Keep the existing a11y work: skip link, landmarks, visible focus rings, AA contrast, 44px touch targets on mobile, reduced-motion support.
