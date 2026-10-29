# Design — Jakbar Twogether

Redesigned with Impeccable (Persuade mode, marketing surface). Product truth lives in PRODUCT.md; the direction contract in `.impeccable/surfaces/`. This file describes the built system. `tokens.css` mirrors `app/globals.css` `:root`.

## World

The badminton court is the page. White court lines on sky-blue vinyl are the ground (`.court-field` + `CourtLines`, real 13.4 x 6.1 m proportions). Palette is sampled from `public/brand/jakbar-twogether.jpeg`. Playful and sporty: chunky rounded surfaces, a tilted sticker logo, jersey-style italic condensed display type, scoreboard numerals, authored shuttlecock SVGs.

## Colour (Committed)

- Navy `oklch(28% 0.13 264)`: ink, header, footer, primary buttons, scoreboard bands.
- Sky `oklch(62% 0.17 248)` to deep sky `oklch(50% 0.19 258)`: hero fields. Pale sky `oklch(94% 0.04 235)`: soft panels, announcements.
- Cork yellow `oklch(87% 0.17 92)`: the single action colour (hero CTA, active nav, open-session chip, closing band), always with navy text.
- Status colours (success, warning, destructive) are shared with the app.
- Text on sky is white; never grey.

## Type

- Display: Barlow Condensed 800 italic uppercase (`font-display`): headings, ticket day numbers, scoreboard numerals.
- Body: Figtree (replaces Geist Sans app-wide). Mono: Geist Mono for app tables.
- Body measure max 65ch; `text-wrap: pretty` on paragraphs, balance on headings.

## Components

- Header: navy bar, round logo thumb + display wordmark, pill nav (active = solid cork pill), segmented language switch with `aria-pressed`.
- PageHero: sky court banner carrying each inner page's h1.
- SessionCard: court ticket. Date stub (navy when open, dashed and muted when closed), perforation notches, whole card is one stretched link.
- Scoreboard: navy `dl` with cork numerals (community stats, session courts/capacity/waitlist).
- Cards: 2px borders, soft navy-tinted blur shadows, radius 16px+. FAQ: rounded `details`, navy border when open.
- Footer: navy, tilted logo sticker, labelled footer nav.

## Motion

One authored moment: shuttlecocks drift in on the landing hero (`shuttle-drift`, 420ms ease-out). Cards lift 2px on hover. All removed under `prefers-reduced-motion`.

## Accessibility (kept)

Skip link, `main#main`, labelled navs, 3px focus rings (white on navy and sky), 44px touch targets below md, AA contrast, decorative SVGs `aria-hidden`.

## Scope

Marketing routes only. `(app)` and `(auth)` inherit the new tokens (navy primary, sky accent, Figtree) but were not redesigned.
