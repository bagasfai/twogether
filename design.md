# Design — Jakbar Twogether

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Produced by `hallmark redesign` (multi-page flow), 2026-09-13. Genre chosen as
**modern-minimal** rather than the literal "playful" brief answer, because half
this product is a live operations dashboard (court/match/rotation management
under time pressure) and the catalog's playful theme (Hum) explicitly refuses
dashboard briefs. Coral (modern-minimal's canonical theme) keeps the community
warmth the brief asked for while staying legible under live-session pressure.

## Genre

modern-minimal

## Macrostructure family

- **Marketing pages** — Marquee Hero (landing `/`). Sessions browsing (`/sessions`,
  `/sessions/[id]`) varies to Ecosystem Index within the same family — these are
  discovery surfaces (upcoming / by day / by venue), not a single statement page.
- **App pages** — Workbench (dashboard, profile, new-session form, the live
  session-manage console). Content-first, minimal marketing chrome, functional
  headers — "here's what you do with it," never a hero.
- **Auth pages** — no macrostructure; a single centred card (login, signup,
  auth error). Utility screens don't need a page shape.

## Theme

Coral — warm-grey paper, single restrained coral accent, Geist throughout,
soft pill CTAs. The "Stripe-not-Linear" warmth.

- `--color-paper`    oklch(97% 0.008 35)
- `--color-paper-2`  oklch(94% 0.010 35)
- `--color-ink`      oklch(20% 0.012 35)
- `--color-ink-2`    oklch(48% 0.012 35)  (muted text)
- `--color-rule`     oklch(88% 0.010 35)
- `--color-accent`   oklch(64% 0.170 32)  (coral — links, focus, active state, small emphasis only)
- `--color-focus`    oklch(64% 0.190 32)
- `--color-success`  oklch(58% 0.140 150) (confirmed / checked-in)
- `--color-warning`  oklch(70% 0.150 80)  (waitlisted)
- `--color-danger`   oklch(58% 0.200 25)  (cancelled / full)

**Accent discipline:** coral is a highlighter, not a fill. Primary buttons are
filled ink (dark) with white-ish text; secondary buttons are ink-outlined.
Coral marks links, the active nav item, focus rings, and status accents only —
never a full button fill, never more than ~5% of a viewport.

## Typography

- Display: Geist Sans, weight 600, tracking -0.02em (already loaded via
  `next/font/google` in `app/layout.tsx` — preserved, not replaced)
- Body: Geist Sans, weight 400 (same family as display — single-family
  discipline, canonical for modern-minimal)
- Mono/outlier: Geist Mono, weight 400/500 — wordmark tag + tabular data only
  (roster counts, waitlist position, match scores, timestamps). Not a third
  visual register, a functional one.
- Display tracking: -0.02em
- Type scale anchor: `--text-display: clamp(2.5rem, 4vw + 1rem, 4.25rem)`
  (kept modest — this product's hero is a "coming soon" community statement,
  not a SaaS pitch; oversized display would fight the Workbench pages' restraint)

## Spacing

4-point named scale (see Exports → tokens.css). Pages use named tokens
(`var(--space-md)`), never raw pixel values.

## Motion

- Easings: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`
- Durations: `--dur-micro: 120ms`, `--dur-short: 220ms`, `--dur-long: 420ms`
- Reveal pattern: none on app pages (function first); marketing pages get one
  orchestrated on-load reveal at most, never scroll-triggered fade-on-everything.
- Cards: 1px lift + border-color shift on hover, `--dur-short`, `--ease-out`.
  No spring, no scale, no shadow-bloom.
- Reduced-motion fallback: opacity-only, ≤150ms, per `motion.md`.

## Microinteractions stance

- Silent success — no "Saved!" toast when the result is already visible on
  screen. Toasts are reserved for async/background outcomes and failures.
- Optimistic update + Undo (5–10s) for reversible actions — cancel
  registration, remove from roster, etc. — never a confirm-dialog for a
  reversible action. This also satisfies the product's host-override
  requirement: an optimistic action a host can undo IS the manual override.
- Hover tooltip delay 800ms; focus tooltip delay 0ms.
- Focus rings appear instantly (never transitioned), 3px, coral-tinted,
  ≥3:1 contrast.

## CTA voice

- Primary: filled ink pill, white text, `--radius-pill` (999px)
- Secondary: ink-outlined pill, transparent fill
- Destructive: `--color-danger` outline, fills only on confirm-hold or after
  a type-to-confirm step for irreversible actions (deleting a session, not
  cancelling a registration)

## Per-page allowances

- Marketing pages MAY use light enrichment (Tier-A CSS art at most — no stock
  photography, no generated imagery, this is a community project without a
  photo library yet).
- App pages MUST NOT use enrichment — function carries the page. No hero, no
  illustration, no marketing copy voice.
- Auth pages: typography only, single card, no enrichment.

## What pages MUST share

- The "Jakbar Twogether" wordmark, set in Geist Sans 600, tracking -0.02em.
- The coral accent and its restrained placement (links, focus, active states).
- Geist Sans display + body, Geist Mono for tabular/functional data.
- The CTA voice (pill shape, ink-filled primary, ink-outlined secondary).
- Status colour semantics (success/warning/danger) — used identically on the
  public sessions list, the roster table, and the manage console.

## What pages MAY differ on

- Macrostructure within the page-type family (sessions browsing can use
  Ecosystem Index while the landing stays Marquee Hero — both still share
  type, colour, and CTA voice).
- Nav chrome: marketing pages use a real nav bar (N1b-derived); the app shell
  keeps its existing functional top bar, restyled with system tokens rather
  than replaced with a marketing nav archetype — a live-ops console does not
  want a frosted floating pill competing for attention with court/match state.
- Footer: marketing pages get Ft2 (inline single line); the app shell has no
  footer (functional chrome only, matches every real SaaS console).

## Out of scope for this pass

`about`, `gallery`, `FAQ` pages don't exist yet (CLAUDE.md marks them
unbuilt Growth/Branding tier). This redesign restyles what exists — the
landing stub, sessions browsing, every `(app)` screen, and the auth
screens — it does not invent new marketing pages.

## Exports

Drop-in formats for reusing this design system elsewhere.

### tokens.css

```css
:root {
  --color-paper:      oklch(97% 0.008 35);
  --color-paper-2:    oklch(94% 0.010 35);
  --color-ink:        oklch(20% 0.012 35);
  --color-ink-2:      oklch(48% 0.012 35);
  --color-rule:       oklch(88% 0.010 35);
  --color-accent:     oklch(64% 0.170 32);
  --color-focus:      oklch(64% 0.190 32);
  --color-success:    oklch(58% 0.140 150);
  --color-warning:    oklch(70% 0.150 80);
  --color-danger:     oklch(58% 0.200 25);

  --font-display: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-body:    var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-outlier: var(--font-geist-mono), ui-monospace, monospace;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm:  0.75rem;  --space-md:  1rem;    --space-lg: 1.5rem;
  --space-xl:  2.5rem;   --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-xs: 0.8rem; --text-sm: 0.875rem; --text-md: 1.125rem;
  --text-lg: 1.375rem; --text-xl: 1.75rem; --text-display: clamp(2.5rem, 4vw + 1rem, 4.25rem);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;

  --radius-card: 12px; --radius-pill: 999px; --radius-input: 8px;
}
```

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper:   oklch(97% 0.008 35);
  --color-ink:     oklch(20% 0.012 35);
  --color-accent:  oklch(64% 0.170 32);
  --font-display:  var(--font-geist-sans), sans-serif;
  --font-body:     var(--font-geist-sans), sans-serif;
  --spacing-md:    1rem;
  --text-md:       1.125rem;
  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper":   { "$value": "oklch(97% 0.008 35)", "$type": "color" },
    "ink":     { "$value": "oklch(20% 0.012 35)", "$type": "color" },
    "accent":  { "$value": "oklch(64% 0.170 32)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist Sans", "$type": "fontFamily" },
    "body":    { "$value": "Geist Sans", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background:         97% 0.008 35;   /* paper */
  --foreground:         20% 0.012 35;   /* ink */
  --primary:            20% 0.012 35;   /* ink-filled primary CTA */
  --primary-foreground: 97% 0.008 35;
  --muted:              94% 0.010 35;
  --muted-foreground:   48% 0.012 35;
  --border:             88% 0.010 35;
  --input:              88% 0.010 35;
  --ring:               64% 0.190 32;   /* coral focus ring */
  --radius:             12px;
}
```
</content>
