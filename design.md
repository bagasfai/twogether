---
name: Jakbar Twogether
description: "A West Jakarta badminton community drawn like a court: white lines on sky-blue vinyl, navy ink, one cork-yellow action."
colors:
  navy: "oklch(28% 0.13 264)"
  sky: "oklch(62% 0.17 248)"
  sky-deep: "oklch(50% 0.19 258)"
  sky-pale: "oklch(94% 0.04 235)"
  cork: "oklch(87% 0.17 92)"
  court-white: "oklch(98.5% 0.008 240)"
  ink: "oklch(26% 0.11 265)"
  muted-ink: "oklch(45% 0.06 258)"
  link-blue: "oklch(46% 0.17 258)"
  line: "oklch(88% 0.03 240)"
  success: "oklch(58% 0.14 150)"
  warning: "oklch(80% 0.15 85)"
  destructive: "oklch(55% 0.21 25)"
typography:
  display:
    fontFamily: "Barlow Condensed, Figtree, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 8vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Figtree, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "Barlow Condensed, Figtree, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.court-white}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "8px 16px"
  button-action:
    backgroundColor: "{colors.cork}"
    textColor: "{colors.navy}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "8px 24px"
  button-outline:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "8px 16px"
  card:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
---

# Design System: Jakbar Twogether

## Overview

**Creative North Star: "The Court Line"**

The badminton court is the page. White lines on sky-blue vinyl are the ground, and everything is drawn the way a court is marked: the active thing is solid, the inactive thing is dashed, and exactly one colour, cork yellow, says "do this". The palette is sampled from the club's own logo, so the site looks like the community, not like a booking tool.

The marketing site speaks loudly: italic condensed jersey type, a tilted sticker logo, perforated session tickets. The signed-in console keeps the same world but works quietly: the court shows up as state (courts in use are solid navy, idle courts are pale sky, unavailable courts are dashed) and the hosts' numbers read like a scoreboard. Light only: it is used outdoors and court-side in daylight, so there is no dark theme.

**Key Characteristics:**
- Chunky and confident: large rounded surfaces, 2px borders, one obvious primary action per view.
- Solid means active, dashed means inactive or closed.
- Cork yellow is the only action colour and always carries navy text.
- Numerals are display type, tabular, and read like a scoreboard.
- Text on sky is white; it is never grey.

## Colors

A committed sky-and-navy palette with one warm accent, all in OKLCH.

### Primary
- **Court Navy** (oklch(28% 0.13 264)): ink for headings, header and footer bands, primary buttons, scoreboard strips, in-use courts.
- **Vinyl Sky** (oklch(62% 0.17 248)) and **Deep Vinyl** (oklch(50% 0.19 258)): hero and auth fields. Every stop of the court-field gradient stays at or above 4.5:1 against white text.

### Secondary
- **Cork Yellow** (oklch(87% 0.17 92)): the single action colour: hero CTA, active nav pill, open-session chip, the checked-in numeral, the closing band. Always navy text on top.

### Neutral
- **Pale Sky** (oklch(94% 0.04 235)): soft panels, announcements, idle courts, checked-in rows, tab tracks.
- **Court White** (oklch(98.5% 0.008 240)): the page ground. Cards are pure white.
- **Court Ink** (oklch(26% 0.11 265)) and **Muted Ink** (oklch(45% 0.06 258)): body text and secondary text. **Link Blue** (oklch(46% 0.17 258)) is for text links.
- **Chalk Line** (oklch(88% 0.03 240)): borders and dividers.
- **Success** (oklch(58% 0.14 150)), **Warning** (oklch(80% 0.15 85)), **Destructive** (oklch(55% 0.21 25)): shared with the signed-in app.

### Named Rules
**The One Action Rule.** Cork yellow means the next action. If two things on a screen are cork, one of them is wrong.

**The Solid-Dashed Rule.** Active, open and in use are solid. Closed, idle-but-unavailable and inactive are dashed or muted. Never use colour alone to say it: pair it with text or a badge.

## Typography

**Display Font:** Barlow Condensed (with Figtree)
**Body Font:** Figtree (with system sans)

**Character:** A jersey-number display face over a friendly rounded-geometric body face. Loud where the club speaks, plain where people work.

### Hierarchy
- **Display** (800 italic uppercase, clamp(2.75rem, 8vw, 5rem), 0.9): hero headlines and ticket day numbers.
- **Headline** (800 italic uppercase, 2.25 to 3rem, 1): section titles on marketing pages.
- **Title** (700, 1.5rem, 1.15): card and ticket titles, step titles, page titles in the console (`PageTitle`, `SectionTitle`).
- **Body** (400, 1rem, 1.5): all running text, capped at 65ch with `text-wrap: pretty`.
- **Label** (600, 0.75rem, 0.04em tracking, uppercase for weekday and month): chips, badges, scoreboard captions.

### Named Rules
**The Scoreboard Numeral Rule.** Any number the host or visitor reads at a glance (day, counts, courts, queue) is display type with tabular figures, never body text.

## Layout

Marketing pages use a centred 64rem (5xl) container with 24px side padding, sections separated by 64px vertical rhythm, and a sticky navy header with a pill nav. The signed-in app uses a 72rem (6xl) shell and works in narrow single columns on phones.

The manage console is built for a phone at the court: a sticky scoreboard strip on top, a bottom-pinned tab bar for the four panels (Courts, Matches, Roster, Photos) under 1024px, and all panels side by side from 1024px. Touch targets are 44px or more below the md breakpoint (buttons, chips, search, tabs). Content is never allowed to scroll horizontally.

## Elevation & Depth

Tonal layering first, soft navy-tinted shadows second. Surfaces sit on the pale ground with a 2px border or a diffuse shadow whose colour is navy, never black. Hard offset shadows are not used.

### Shadow Vocabulary
- **Card** (`--shadow-card`, 0 6px 20px -12px navy at 35%): default cards and list items.
- **Ticket** (`--shadow-ticket`, 0 8px 24px -12px navy at 35%): session and album cards at rest. **Ticket hover** (`--shadow-ticket-hover`, 0 14px 28px -12px navy at 45%) with a 2px lift.
- **Bar** (`--shadow-bar`, 0 8px 20px -10px navy at 60%): the sticky scoreboard, the bottom tab bar and the cork CTA.
- **Float** (`--shadow-float`, 0 24px 48px -16px dark navy at 65%): the hero ticket, the logo sticker and auth cards.

### Named Rules
**The Navy Shadow Rule.** Shadows are always tinted navy and defined once as theme tokens. Do not write shadow values inline.

## Shapes

Chunky and rounded. Cards are 16px (`--radius`), controls and inputs 14px, buttons and chips are fully pill-shaped, and the logo sticker is a tilted rounded square with a 4px white border. Perforation notches and dashed lines are the recurring motif for tickets and inactive states. Court lines (white at about 20% opacity) draw behind hero fields.

## Components

### Buttons
- **Shape:** pill (9999px), 36px high on desktop and 44px on phones.
- **Primary:** navy fill, near-white text. **Action:** cork fill with navy text and the bar shadow, used once per view.
- **Outline:** white fill with a 2px navy or chalk border; on a sky field it is transparent with a white border and white text.
- **Hover / Focus:** a quick 120ms colour change and a 3px focus ring (white on navy and sky, blue ring elsewhere). Disabled is 50% opacity.
- **Destructive actions** never fire on one tap: they go through the confirm dialog, whose default focus is "Keep".

### Chips and badges
- Status badges for confirmed, waitlist and checked in; cork chip means open registration; dashed or outline means closed. Roster filter chips are pill buttons with `aria-pressed`: selected is navy with white text, others white with a chalk border.

### Cards and Containers
- **Corner Style:** 16px. **Background:** white on the pale ground. **Border:** 1px chalk, or 2px for tickets and choice tiles. **Shadow:** per the vocabulary above. **Padding:** 24px (12px on dense console cards).

### Inputs
- **Style:** 14px radius, 1px stroke in a soft blue-grey, transparent or white fill, 16px text on phones to avoid zoom. **Focus:** 3px ring and a border shift. **Error:** destructive border and ring.

### Session Ticket (signature)
- A court ticket: navy date stub with display numerals (dashed and muted when closed), perforation notches, a cork "open" chip, one stretched link covering the whole card, a 2px lift on hover. Used in the hero for the next session and in lists.

### Scoreboard Strip (signature)
- A sticky navy bar in the console: a connection pill (Connecting, Live, Connected, Offline), the registration state, then display numerals for confirmed, waiting, checked in (cork), courts in use and ready players.

### Navigation
- Navy header with a round logo thumb and the display wordmark; pill links where the active one is solid cork. A segmented language switch with `aria-pressed`. The console adds a bottom tab bar on phones with counts on each tab.

## Do's and Don'ts

### Do:
- **Do** use cork yellow once per view, for the next action, with navy text.
- **Do** keep every touch target at least 44px on phones and keep focus rings visible.
- **Do** draw state with fill, border style and text together: solid for active, dashed for inactive.
- **Do** use the shadow tokens and OKLCH colour tokens; add a token before writing a one-off value.
- **Do** keep motion to one authored moment (the shuttlecock drift) plus small hover lifts, and remove them under `prefers-reduced-motion`. Fades may stay.
- **Do** make Bahasa Indonesia and English layouts survive the longer string.

### Don't:
- **Don't** add a dark theme or `dark:` classes: the product is used in daylight and ships light only.
- **Don't** use grey text on sky or navy fields; use white or a tint of the field.
- **Don't** invent testimonials, member counts or photos. Show real data or nothing.
- **Don't** put an eyebrow label above a heading or use gradient text.
- **Don't** fire a destructive action on one tap, or place it in the same row as the primary action without a confirm.
- **Don't** use hard offset shadows or black shadows.
