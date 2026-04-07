# Home Page Design Spec

**Date:** 2026-04-07
**Status:** Approved for implementation

---

## Context

The current `app/page.js` is a stub — title, one sentence, and a link to `/network`. This spec defines the real home page: a polished dark landing page that serves as the entry point to the site, then hands visitors off to the network or donors pages.

The aesthetic matches the existing network page (dark `#01010d` base, mono font, orange/teal/green accents) but adds Instrument Serif for the hero headline to give it weight and gravitas on first impression. The tone is: data journalism credibility meets civic transparency tool.

---

## Layout (top to bottom)

### 1. Nav (already exists in `app/layout.js`)
No changes — keep the existing sticky dark nav with FL DONOR TRACKER logo and links.

### 2. Hero section
- **Eyebrow:** `"Florida · 1996–2026 · Public Record"` — small, uppercase, letter-spaced, `#5a6a88`
- **Headline:** `$930,646,176 raised in Florida politics.` in **Instrument Serif** at ~3rem. The dollar amount is in orange (`#ffb060`), the rest is white. Pull the exact figure from `meta.total_amount` at build time (see Script 08 change below).
- **Sub-copy (placeholder — needs punchier copy later):** `"Tracking {N} contributions across {M} registered committees. All data from the Florida Division of Elections — public record."` Pull N from `meta.total_contributions`, M from `meta.total_committees_with_data`.
- **CTA row:** `[Top Donors]` (solid orange button) · `[→ network]` (ghost border button) · `Updated {date}` (dim text, from `meta.json`)

### 3. Search bar
- Label: `"Search donors & committees"` — small uppercase
- Full-width input (max 540px), mono font, dark background, blue-tinted border
- Placeholder: `"_ search by name, employer, zip code..."`
- Arrow `→` submit button on the right
- **Behavior:** filters the donors table below inline (client-side, no navigation). Matches against `canonical_name` field. Case-insensitive. Clears to show all 100 on empty input.

### 4. Top Donors table
- **Source:** `public/data/top_donors.json` — 100 donors, loaded at build time as a server component, passed as prop to client component for filtering
- **Default:** show first 25 rows
- **Columns:** `#` rank · Name · Type badge · Total given (right-aligned, orange) · Contributions count (right-aligned, dim)
- **Type badges:** `committee` (green tint) · `corporate` (orange tint) · `individual` (teal tint)
- **Load more:** "Load 25 more →" button below the table — reveals next 25. Button disappears when all 100 are shown.
- **Search filtering:** when search is active, show all matching results (no 25-cap), hide the load more button
- **Row click:** links to `/donors/{slug}` — stub for now (no page yet), use `href` so it's ready when that page is built

### 5. Footer (already in `app/layout.js`)
No changes — keep existing disclaimer.

---

## Components

### New files to create
- `app/page.js` — server component. Imports `top_donors.json` and `meta.json` at build time. Renders hero + passes donor data to `<DonorTable>`.
- `components/donors/DonorTable.js` — **client component** (`'use client'`). Receives full donors array as prop. Owns search state and pagination state. Renders search bar + table.

### Reuse
- `app/layout.js` — unchanged (nav + footer already there)
- `app/globals.css` — add Instrument Serif Google Fonts import + one new CSS var `--font-serif`

---

## Data

Both loaded via static import at build time (server component — no `useEffect`, no fetch):

```js
import topDonors from '@/public/data/top_donors.json'
import meta from '@/public/data/meta.json'
```

`meta.json` fields used: `generated_at` (for "Updated" date), `total_contributions` (N), `total_committees_with_data` (M), `total_amount` (dollar figure in hero — **requires script 08 change below**).

`top_donors.json` fields used per row: `name`, `total_amount`, `num_contributions`, `type` (for badge — **requires script 08 change below**).

### Required change to `scripts/08_export_json.py`
Two additions before this page can use live data:
1. Add `total_amount` to `meta.json` — sum of `amount` across all contributions
2. Add `type` field to each entry in `top_donors.json` — `"committee"` if the donor name matches a committee in `committees.csv`, otherwise `"corporate"` if `is_corporate` is true, else `"individual"`

---

## Fonts

Add to `app/globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;600&display=swap');
```

Add to `:root`:
```css
--font-serif: 'Instrument Serif', serif;
--font-sans:  'Instrument Sans', sans-serif;
```

---

## Parking lot (not in scope for this build)
- Tagline/sub-copy needs a punchier rewrite — placeholder text is fine for now
- Dark vs light theme decision deferred
- `/donors/[slug]` donor profile page (table rows link to it as stubs)
- Sort controls on the table (by amount, by count)

---

## Verification
1. `npm run dev` → home page loads with real dollar figure in hero from `meta.json`
2. Typing in search bar filters the table live — no page reload
3. "Load 25 more" reveals next 25; disappears after 100
4. Search active → shows all matches, hides load more
5. `npm run build` → 0 errors, home page is statically exported
