# Home Page Redesign — Spec

**Date:** 2026-04-07
**Status:** Approved

## Goal

Enhance the existing home page with pathos, purpose, and tool discovery. The current page has a hero + donor table. We're adding a stats strip, mission section, and tool cards between them — plus animating the hero dollar total on load to convey scale and urgency.

## Tagline

> "Connecting the dots to shed light on the Sunshine State."

This line lives in the hero sub-copy, below the headline.

---

## Page Layout (top to bottom)

### 1. Nav
Existing — no changes.

### 2. Hero
Existing layout. Two changes:
- Sub-copy updated to include the new tagline
- Dollar headline becomes `<HeroCounter>` — a client component that counts up from 0 to the real `meta.total_amount` on mount, then stops. Instrument Serif, orange color, unchanged visual treatment.

### 3. Stats Strip
Four figures in a horizontal row, sourced from `meta.json`:

| Stat | Value | Color |
|---|---|---|
| Total contributions | `$1.0B+` (formatted from `meta.total_amount`) | orange |
| Transactions | `338K` (formatted from `meta.total_contributions`) | teal |
| Committees | `1,888` (from `meta.total_committees_with_data`) | green |
| Years of data | `30 yrs` (hardcoded: 1996–2026) | blue |

Each stat: large bold number on top, small dim label below. No animation. Static server-rendered.

### 4. Purpose Section
Two-column layout, max-width 900px:

**Left column — mission copy:**
> Florida is one of the biggest political money machines in the country. Billions flow between donors, committees, and campaigns every cycle — but the trail is buried in raw government files that almost no one reads.
>
> This site pulls every contribution record from the Florida Division of Elections and makes it searchable, visual, and human. No spin. No agenda. Just the data — yours to explore.

**Right column — "What you can find here" bullets:**
```
→ Who gave the most, to whom, and when
→ How money moves between committees
→ Corporate vs. individual vs. PAC donors
→ 30 years of Florida political finance
```

Right column has a left border separator. Static server-rendered.

### 5. Tool Cards
Three cards in a horizontal row. No emojis — minimal text with `→` prefix arrows to match mono aesthetic.

| Card | Label | Accent | Description | Link |
|---|---|---|---|---|
| Search | `→ search donors` | orange | "Find any donor by name. See total giving and which committees they fund." | `#donors` (scrolls to table) |
| Network | `→ explore network` | teal | "Visualize the full donor-committee money network. Trace how funds flow across thousands of nodes." | `/network` |
| Committees | `→ browse committees` | green | "Individual committee pages — top donors, total received, full history." | disabled, labeled "coming soon" |

Each card: 1px border with accent color at low opacity, label in accent color, description in dim text. Coming soon card is visually muted (lower opacity, no hover state, cursor default).

### 6. Donor Table
Existing `<DonorTable>` component — search, pagination, type badges. No changes.

### 7. Footer
Existing — no changes.

---

## New Components

### `components/home/HeroCounter.js`
- `'use client'`
- Props: `total` (number)
- On mount: animates from 0 to `total` using `requestAnimationFrame`
- Easing: easeOutQuart — fast start, smooth deceleration
- Duration: ~2000ms
- Format: same as existing `formatHeroDollars` — `$X,XXX,XXX,XXX` (no decimals)
- Renders a `<span>` with the orange color and Instrument Serif font, matching the current static headline style exactly

---

## Files Changed

| Action | File |
|---|---|
| Create | `components/home/HeroCounter.js` |
| Modify | `app/page.js` — import HeroCounter; add stats strip, purpose section, tool cards |

No new data files. All stats sourced from existing `meta.json`. No new API calls.

---

## Constraints

- No TypeScript
- No new dependencies
- Inline styles only (no Tailwind)
- Mobile-responsive: stats strip wraps to 2×2 on small screens; tool cards stack vertically; purpose section stacks to single column
- NEVER editorialize — mission copy describes the data, not a political position
- Disclaimer on page: "Not affiliated with the State of Florida. All data from public records."
