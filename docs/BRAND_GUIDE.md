# Florida Influence — Brand & Design System Guide

A reference for implementing the current `Prototype.html` aesthetic across every page of floridainfluence.com. This is the single source of truth: match these tokens, patterns, and rules exactly.

**Visual DNA in one sentence:** A newspaper-of-record crossed with a terminal — serif headlines, monospace captions, pitch-black background, warm amber identity, Florida-outline motif, quarterly-filings rigor with a faintly noir voice ("a sunny place for shady people").

---

## 1. Tone & Visual Language

The site has **two voices**, and they live in different places. Do not mix them on the same surface.

### 1A. Neutral voice — the default

Used on: homepage, all data directories (candidates, committees, donors, lobbyists, legislators, industries), races, all tables, search, nav, footer chrome, methodology, sources.

- **Tone:** Clean, factual, cooperative. Like a well-designed government data portal or a library catalog. The data is the subject; we are the furniture around it.
- **Writing formula:** Short declarative sentences. Label the thing, state the number, cite the source. No adjectives unless they carry information (e.g. *"normalized"* or *"inferred"* = information; *"staggering"* or *"shocking"* = decoration, cut).
- **No editorial framing.** Headlines name what's on the page, not how to feel about it.
  - ✅ *"Q1 2026 contributions"* · *"Who funds your district"* · *"160 legislators, indexed"* · *"Recent filings"*
  - ❌ *"The checks that bought Tallahassee"* · *"Follow the money that shapes FL politics"* · *"Here's what they don't want you to see"*
- **No italicized accent phrases** in headlines on these surfaces. Serif stays upright; the amber color alone is enough emphasis when needed.
- **Kickers are factual:** `◤ Q1 2026 FILINGS`, `◤ FL LEGISLATURE · 160 MEMBERS`, `◤ 22M TRANSACTIONS · 1996–2026`.
- **Data labels:** caps + mono + 0.1–0.2em tracking, descriptive only. `SOURCE · FL DIVISION OF ELECTIONS · Q1 2026 DROP`.
- **No tagline, no signature line.** *"A sunny place for shady people"* does **not** appear on data surfaces.
- **Rewriting the current hero in this voice:**
  - Before: *"Follow the money and influence that shapes FL Politics"*
  - After: *"Florida campaign finance and lobbying, on the record since 1996."* (no italic; serif upright; amber only on the Florida outline and the money total.)

### 1B. Editorial voice — analysis, investigations, connect-the-dots

Used on: `/investigations`, `/decode` (shadow PAC decoder), `/follow` (Follow the money), `/connections`, `/flow`, `/network`, `/timeline`, `/pulse` (weekly), `/transparency`, the newsletter block, About, and any standalone explainer or data-story page.

Here the site is allowed a personality: dry, observant, a little noir, willing to be clever. Puns and cute headlines are welcome — but the voice still earns itself by landing on a named donor, a dollar amount, or a dated filing. Vibes without receipts are out.

- **Puns and cute headlines — examples that fit:**
  - *"Sunshine laundry."* (shadow PAC decoder)
  - *"The usual names."* (recurring top donors)
  - *"Paper trails."* (PAC-to-PAC transfers)
  - *"Dark money, lit."* (independent expenditures)
  - *"Who's buying whom."* (compare / connections)
  - *"Follow the paper."* (follow-the-money tool)
- **Signature line:** *"Florida: a sunny place for shady people."* Allowed on the About page, the newsletter block, and as the footer tagline. Nowhere else.
- **Italicized amber accent phrases** are permitted in serif headlines here, one per page maximum. Example formula: `The usual *names.*`
- **Kickers can be atmospheric:** `◤ THE USUAL NAMES`, `◤ FOLLOW THE PAPER`, `◤ THIS WEEK'S LEDGER`.

### Which voice is this page?

| If the page's job is to… | Use voice |
|---|---|
| Answer a lookup ("show me donors in 33139") | **1A** |
| Display a directory or table | **1A** |
| Present a total, race card, or stat block | **1A** |
| Tell you something you wouldn't see from the raw data | **1B** |
| Explain our methodology or mission | **1B** |
| Walk through a decoded relationship or flow | **1B** |

### Principles (both voices)
1. **Receipts over rhetoric.** Every claim ships with a source line, an updated date, and a confidence level.
2. **Data is the art.** Don't decorate; typeset. Tabular numerics, hairline dividers, one accent color per section.
3. **Dense, not cramped.** Information density is a feature. Whitespace goes between sections, not within them.
4. **Two type voices on the page:** serif = naming things (entities, amounts, page titles); mono = metadata (dates, sources, labels, nav). Never flip them.
5. **The Florida outline is the logo.** Never appears without the mono wordmark beside it, except in the hero.
6. **Quarterly, not real-time.** FL campaign finance is filed quarterly. Never imply otherwise. The only "live" element is the since-1996 cumulative money clock.
7. **No editorializing on 1A surfaces.** If a page is a table, a directory, or a lookup, it reads like a reference work.

---

## 2. Typography

### Font Families

```css
/* Load via Google Fonts */
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Role | Family | Fallback stack |
|---|---|---|
| **Serif (editorial)** | `Instrument Serif` | `'Iowan Old Style', Georgia, serif` |
| **Sans (UI / body)** | `Instrument Sans` | `system-ui, sans-serif` |
| **Mono (meta / data)** | `JetBrains Mono` | `'Courier New', monospace` |

> **Note:** The current hero headline uses `Georgia` directly (fallback from `Instrument Serif` — rendered identically on most systems). New pages should use `var(--font-serif)` which points at the Instrument Serif stack.

### CSS Variables

```css
:root {
  --font-serif: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
  --font-sans:  'Instrument Sans', system-ui, sans-serif;
  --font-mono:  'JetBrains Mono', 'Courier New', monospace;
}
```

### Type Scale & Usage

| Use | Font | Size | Weight | Line-height | Letter-spacing | Notes |
|---|---|---|---|---|---|---|
| **H1 — Hero headline** | serif | `clamp(36px, 4.6vw, 58px)` | 400 | 1.02 | -0.022em | Three-line stagger; middle line italic + brand color |
| **H2 — Section title (editorial)** | serif | 32px | 400 | 1.1 | -0.015em | Pair with mono kicker above |
| **H2 — Section title (smaller)** | serif | 28px | 400 | 1.1 | -0.01em | Races, secondary sections |
| **H3 — Subsection** | serif | 22px | 400 | 1.15 | -0.01em | Hub group titles |
| **Display stat number** | serif | 42px | 400 | 1.0 | -0.02em | `font-variant-numeric: tabular-nums`, color = accent |
| **Stat in card** | serif | 24–26px | 400 | 1.0 | -0.02em | Tabular nums |
| **Money inline** | serif | 18px | 400 | — | -0.01em | Brand color, right-aligned, tabular |
| **Editorial body text / entity names** | serif | 15–16px | 400 | 1.4 | -0.005em | Donor names, list items |
| **Success/state headline** | serif | 20px | 400 | — | — | Confirmation messages |
| **Lede / intro paragraph** | mono | 13px | 400 | 1.8 | — | 82% opacity, max-width ~540px |
| **Body meta (card descriptions)** | mono | 10–12.5px | 400 | 1.55–1.75 | 0.04em | `textDim` color |
| **Kicker / eyebrow** | mono | 10px | 400 | 1 | 0.2em | UPPERCASE, often `◤` prefixed |
| **Column headers (tables)** | mono | 9px | 400 | 1 | 0.16em | UPPERCASE, `textDim` |
| **Tag / badge text** | mono | 8.5–9.5px | 400 | 1 | 0.12–0.18em | UPPERCASE |
| **Data timestamp** | mono | 10px | 400 | 1 | 0.08em | Tabular nums |
| **Footer legal** | mono | 10px | 400 | 1 | 0.1em | `textMute` color |
| **Nav link** | mono | 10.5px | 400 | 1 | 0.16em | UPPERCASE, `textDim` → `brand` on hover |
| **Brand wordmark** | mono | 11–12px | 700 | 1 | 0.22–0.24em | UPPERCASE |

### Typography Rules
- **Never mix more than two font families in a single element.**
- **Italic is reserved for:** brand-colored accent phrases in serif headlines, and the Florida tagline.
- **Tabular numerics** on every number that could appear stacked in a column: `font-variant-numeric: tabular-nums`.
- **Text-wrap: pretty** on long body copy.
- **Never use bold weights in Instrument Serif** — use size, color, or italic instead. Mono weights 500–700 are fine for wordmarks, nav links, hub-card titles, and button labels; the no-bold rule applies only to the serif face.

---

## 3. Color Palette

All colors below are exact; do not substitute approximations.

### Surfaces & Text

| Token | Hex / Value | Use |
|---|---|---|
| `--bg` | `#01010d` | Page background. Near-black with a trace of blue. Never pure `#000`. |
| `--surface` | `#080818` | Elevated surface (footer band, subtle cards) |
| `--surface-2` | `#0d0d24` | Overlays, dropdowns, popovers |
| `--border` | `rgba(100,140,220,0.18)` | Default 1px dividers, card borders |
| `--border-hi` | `rgba(100,140,220,0.36)` | Focused / elevated card borders |
| `--text` | `#c8d8f0` | Primary body text (cool off-white) |
| `--text-dim` | `#7a8eaa` | Secondary text, labels, nav links at rest |
| `--text-mute` | `rgba(122,142,170,0.5)` | Tertiary / legal / disabled |

### Semantic Accents — each does exactly one job

| Token | Hex | Semantic job |
|---|---|---|
| `--brand` | `#ffb060` | **Identity.** H1 italic accent, Florida outline, money totals, primary CTA, kickers. *Also used as the entity-link color for donors, candidates, politicians.* |
| `--interactive` | `#4dd8f0` | **Links, hover, active.** Search focus, interactive hover states. *Also the entity-link color for committees, lobbying firms, legislators.* |
| `--live` | `#80ffa0` | **New / live / fresh.** Live pulse dot, 2026 LIVE tag, confirmation state, lobbying stat |
| `--warn` | `#ffd060` | **Caveats.** Shadow PAC stat, "inferred" confidence, caution rails |
| `--blue` | `#a0c0ff` | **Industries & Individual entity type.** Entity link color for industries; confidence badge color for `CLASSIFIED`; Individual entity-type badge. |
| `--rep` | `#f87171` | Republican party color (use ONLY for party identification) |
| `--dem` | `#60a5fa` | Democratic party color (use ONLY for party identification) |
| `--purple` | `#c084fc` | Lobbying / influence category accent |

#### Legacy token aliases (migration period)

The codebase currently uses `--orange`, `--teal`, `--green`, `--gold`. Do **not** do a site-wide find/replace — 71+ component files and 33 app files reference the old names. Instead, add aliases in `globals.css` so both names work during migration:

```css
:root {
  /* New semantic names (preferred for all new code) */
  --brand:       #ffb060;
  --interactive: #4dd8f0;
  --live:        #80ffa0;
  --warn:        #ffd060;

  /* Legacy aliases — keep until every file is migrated, then delete */
  --orange: var(--brand);
  --teal:   var(--interactive);
  --green:  var(--live);
  --gold:   var(--warn);
}
```

Migration rule: rename file-by-file in batches. Never introduce the new name into a file that still uses the old one. When a batch is clean, verify with grep before moving on. Aliases get deleted only after `--orange`, `--teal`, `--green`, `--gold` are gone from the codebase.

> **Remove unused tokens from `globals.css`.** `--cobalt`, `--sea-green`, and `--cinnabar` (labeled "citrus-grade vocabulary") are defined but never referenced in any component or page. They were exploratory and never adopted. Delete them in the same PR as the legacy-alias cleanup so `globals.css` doesn't carry orphaned identifiers into the next audit.

### Alpha conventions
The system uses hex-alpha suffixes heavily. Stick to these values:

| Suffix | Decimal | Use case |
|---|---|---|
| `05` | 2% | Card resting tint (barely-there wash) |
| `08` | 3% | Card hover tint, newsletter gradient start |
| `11` | 7% | Pill background when active |
| `18` | 9% | Tab active background |
| `30` | 19% | Card border resting |
| `33` | 20% | Newsletter border |
| `55` | 33% | Badge border, hairline rule |
| `88` | 53% | Card border hover |

Example: `${T.brand}08` on a card resting background, `${T.brand}55` on a badge border, `${T.brand}` solid on the fill.

### Color rules
- **Exactly one accent color per section.** If a section uses `brand`, it uses `brand` — not brand + live + interactive.
- **Never gradient from one accent to another.** Brand-to-transparent is allowed (newsletter block: `linear-gradient(135deg, ${brand}08, transparent 60%)`).
- **Party colors (rep/dem) are data, not decoration.** Never use `#f87171` or `#60a5fa` as a UI accent.
- **Selection color is fixed:** `::selection { background: rgba(255,176,96,0.3); color: #fff; }`.

---

## 4. Spacing & Layout

### Container
- **Target page max-width:** `1100px`, centered (`margin: 0 auto`).
- **Horizontal gutter:** `24px` on all sections (`1.5rem`).
- **Vertical rhythm between sections:** `20–28px` (`1.25–1.75rem`) top/bottom padding; hairline `border-top: 1px solid var(--border)` separates major sections.

> ⚠ **Phased change — do not globally replace 900px with 1100px.** The current site uses 900px baked into `.container`, `.hero-2col`, and hand-tuned page padding across profile pages. Widening by 200px will create awkward sidebar whitespace on profile pages. Sequence: (1) home page, (2) directory pages, (3) profiles — testing each phase. Never mutate `.container` globally in a single pass.

### Spacing scale

The codebase uses `rem` (root = 16px). Use these values and nothing in between.

| rem | px | Common use |
|---|---|---|
| `0.125rem` | 2 | Hairline gaps |
| `0.25rem`  | 4 | Tag inner padding |
| `0.375rem` | 6 | Small gaps |
| `0.5rem`   | 8 | Inline gaps, tag pad-x |
| `0.625rem` | 10 | Row-to-row spacing |
| `0.75rem`  | 12 | Card inner padding, row gaps |
| `0.875rem` | 14 | Grid gaps in card rows |
| `1rem`     | 16 | Default padding, chart container |
| `1.125rem` | 18 | Card padding-x |
| `1.25rem`  | 20 | Section padding-y |
| `1.375rem` | 22 | Hub-card padding |
| `1.5rem`   | 24 | Page gutter, section gap |
| `1.75rem`  | 28 | Stat-row gap |
| `2rem`     | 32 | Between-section rhythm |
| `2.25rem`  | 36 | Footer top margin |
| `2.5rem`   | 40 | Footer column gap |
| `2.75rem`  | 44 | Highlight-card padding-x |
| `3rem`     | 48 | Hero column gap, newsletter gap |
| `4rem`     | 64 | Major vertical breaks |

Write new code in `rem`. Pixel values are fine in hand-tuned SVG viewBoxes, 1px borders, and the Recharts axis/tick props (SVG), which do not accept `rem`.

### Grid patterns

| Pattern | CSS |
|---|---|
| 4-col stats row | `display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.75rem` (28px) |
| 3-col card row | `display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.875rem` (14px) for races, or `gap: 0.5rem` (8px) for hub cards |
| Hero split | `grid-template-columns: 1fr 300px; column-gap: 3rem` (48px) |
| Newsletter split | `grid-template-columns: 1.3fr 1fr; gap: 3rem` (48px) |
| Footer | `grid-template-columns: 2fr 1fr 1fr 1fr; gap: 2.5rem` (40px) |
| Recent contributions table | `grid-template-columns: 82px 1fr 110px 1.2fr 80px; gap: 1rem` (16px); track widths stay in px because they're tied to fixed-width numeric cells |

### Responsive
- Below `1100px`: collapse two-column grids to single column; hide any mobile-frame previews.
- Horizontal scroll for nav rails is acceptable; vertical scroll for tables is not — stack on mobile instead.

### Border radius
Low and architectural, never bubbly.

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `2px` | Badges, tag pills, buttons |
| `--radius-sm` | `3px` | Inputs, small cards |
| `--radius-md` | `4px` | Major cards, table containers, newsletter block |

> **Never** use radius > 4px. No pill buttons. No blob cards.

### Shadows
Only one allowed, for floating popovers:
```css
box-shadow: 0 10px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,140,220,0.2);
```
No drop shadows on buttons, cards, or body elements. Depth comes from borders, not shadows.

---

## 5. Components

### 5.1 Nav (Top Bar)

Locked variant: **V01** (flat links, full-size brand, sticky).

```
<nav>  position: sticky; top: 0; z-index: 50;
       background: var(--bg); border-bottom: 1px solid var(--border);
       padding: 16px 24px; display: flex; align-items: center; gap: 20px;

  [brand cluster]  FloridaOutline size=22 + "FL INFLUENCE" mono 12px / 0.24em tracking / weight 700
  [flex spacer]
  [links row]      mono 10.5px / 0.16em tracking / UPPERCASE / color textDim → brand on hover, gap 24px
  [divider]        1px × 18px vertical rule
  [search link]    "⌕ SEARCH" mono 11px / interactive color / 0.16em tracking
```

**Nav link format:** ALL CAPS, mono, textDim color at rest, brand color on hover, 150ms color transition. No underlines. No background pills.

### 5.2 Ticker Rail
Thin band under nav. Border-bottom, `rgba(255,176,96,0.02)` background, `padding: 8px 24px`, mono 10px, `0.16em` tracking, `gap: 28px`. Live items get a 5px pulsing live dot and `--live` color.

### 5.3 Buttons

| Variant | Usage | Spec |
|---|---|---|
| **Primary** | Newsletter subscribe, hero CTA | `background: var(--brand); color: var(--bg); border: none; padding: 0 22px or 14px 16px; font: 700 11px var(--font-mono); letter-spacing: 0.14em; border-radius: 3px; text-transform: UPPERCASE` |
| **Ghost** | "ALL CONTRIBUTIONS →", secondary actions | `background: transparent; border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; font: 10.5px var(--font-mono); letter-spacing: 0.14em; border-radius: 2px` |
| **Tab pill (inactive)** | Category filter | `background: transparent; border: 1px solid var(--border); color: var(--text-dim); padding: 6px 12px; mono 10px / 0.14em` |
| **Tab pill (active)** | Selected filter | Same as inactive but `background: {accent}18; border-color: {accent}; color: {accent}` |
| **Text link** | Inline calls-to-action | `color: var(--interactive); cursor: pointer` + right arrow `→`, mono, UPPERCASE |

All buttons use arrow characters (`→`, `↗`, `⌕`, `◤`, `◆`) instead of icon fonts.

### 5.4 Cards

Three tiers:

**Resting card** (races, hub items):
```css
border: 1px solid {accent}30;
background: {accent}05;
border-radius: 4px;
padding: 1.125rem 1.25rem;  /* 18px 20px */
cursor: pointer;
transition: all 0.2s;
```
Hover: `border-color: {accent}88`, `background: {accent}08`.

**Flat card** (hub grid item, directory result card):
```css
border: 1px solid var(--border);
background: rgba(255,255,255,0.015);
border-radius: 3px;   /* never 6px — the current hub-card uses 6px; update it */
padding: 0.75rem 0.875rem;
/* No box-shadow on hover. The terminal aesthetic relies on borders, not blur. */
/* Current globals.css has a 0 4px 24px rgba(77,216,240,0.07) hover shadow on .hub-card — remove it. */
```
Hover: `border-color: var(--interactive)88; background: rgba(77,216,240,0.04);`

**Highlight card** (newsletter, featured):
```css
border: 1px solid var(--brand)33;
background: linear-gradient(135deg, var(--brand)08, transparent 60%);
border-radius: 4px;
padding: 40px 44px;
```

### 5.5 Table / Ledger Rows

The recent-contributions pattern is the canonical data display.

```
Container:  border: 1px solid var(--border); border-radius: 4px; overflow: hidden

Header row: 82px 1fr 110px 1.2fr 80px grid, gap 16px, padding 10px 18px
            background: rgba(255,255,255,0.02)
            border-bottom: 1px solid var(--border)
            mono 9px / 0.16em / textDim / UPPERCASE

Data row:   padding 12px 18px, align-items: baseline
            border-bottom: 1px solid var(--border)44 (only between, not after last)
            Hover: background: rgba(77,216,240,0.04)

Top row highlight: background: var(--brand)08; animation: fi-slideDown 0.5s ease-out

Money cells:    serif 18px / brand color / text-align: right / tabular-nums / -0.01em
Entity cells:   serif 16px / text color
Meta cells:     mono 9.5–11.5px / textDim / tracked
Party marker:   3px × 14px vertical bar in party color, inline with recipient
```

Footer caption row: `margin-top: 12px; mono 10px; textMute; 0.12em tracking; flex space-between`.

### 5.6 Inputs

```css
background: rgba(1,1,13,0.8);
border: 1px solid var(--border);
color: var(--text);
padding: 14px 16px;
font: 13px var(--font-mono);
border-radius: 3px;  /* or 3px 0 0 3px when paired with a button */
outline: none;
```

Focused search variant: border flips to `--interactive`, background to `rgba(77,216,240,0.04)`, and scales `1.02` with 300ms ease.

### 5.7 Stamps & Badges

**Stamp** (footer signature, section tags):
```css
border: 1.5px solid var(--brand);
color: var(--brand);
padding: 5px 10px (md) / 3px 7px (sm) / 8px 14px (lg);
font: 9.5px var(--font-mono);
letter-spacing: 0.14em;
text-transform: UPPERCASE;
transform: rotate(-2deg);
background: rgba(1,1,13,0.5);
display: inline-block;
```

**Confidence badge** (`DIRECT`, `NORMALIZED`, `INFERRED`, `CLASSIFIED`):
```css
border: 1px solid {semantic}55;
color: {semantic};
padding: 1px 6px;
border-radius: 2px;
font: 9px var(--font-mono);
letter-spacing: 0.14em;
```
- `DIRECT` → `--live`
- `NORMALIZED` → `--interactive`
- `INFERRED` → `--warn`
- `CLASSIFIED` → `--blue` *(not `--rep` — red is reserved for Republican party data; do not apply it to a non-political confidence level)*

**Trust ribbon** (source / updated / confidence meta strip): 1px border, `rgba(255,255,255,0.015)` background, mono 10px textDim, `padding: 10px 14px`, `gap: 20px`, `border-radius: 3px`. Ends with an `interactive`-colored `methodology ↗` link.

**Live dot:**
```css
width: 7px; height: 7px; border-radius: 7px;
background: var(--live);
box-shadow: 0 0 8px var(--live);
animation: fi-pulse 1.8s ease-in-out infinite;
```

### 5.8 Section Header pattern

Every major section uses this three-part header:

```
◤ KICKER (mono 10px / brand or textDim / 0.2em)
Serif H2 with italic-amber accent phrase (32px / text color)
Sub caption (mono 11px / textDim / 0.04em)
```

Example:
```
◤ Q1 2026 FILINGS
Who is funding Florida's government     ← "Florida's government" italic + brand
Most recent filings from the Q1 2026 drop. Florida campaign finance is reported quarterly.
```

### 5.9 Florida Outline (Logo)

Custom SVG path — viewBox `0 0 520 430`. Used at:
- **22px** in the nav cluster
- **20px** in compact nav / masthead variants
- **36px** in the footer
- **300px** in the hero (decorative, amber fill at 0.92 opacity)

Always paired with the wordmark in nav/footer. Standalone use is reserved for the hero and loading states.

### 5.10 Footer

4-column grid `2fr 1fr 1fr 1fr`, gap 40px. Left column: logo cluster + tagline + manifesto paragraph + "EST. 2026 / TALLAHASSEE, FL" stamp. Three right columns: `DATA`, `TOOLS`, `ABOUT` link groups with mono 9.5px UPPERCASE 0.18em column headers and mono 12px textDim links. Bottom legal bar: `border-top: 1px solid var(--border); padding-top: 20px; margin-top: 36px; mono 10px textMute 0.1em`.

---

## 6. Motion

Keep animations sparing and short. All durations ≤ 1.6s.

### Keyframes
```css
@keyframes fi-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(1.3); }
}
@keyframes fi-slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fi-stamp {
  0%   { transform: rotate(6deg) scale(0.85); opacity: 0; }
  60%  { transform: rotate(-4deg) scale(1.08); opacity: 1; }
  100% { transform: rotate(-2deg) scale(1); opacity: 1; }
}
```

### Standard transitions
- **Card hover / color swap:** `transition: all 0.15–0.2s`
- **Layout/reveal:** `transition: all 0.6–0.8s cubic-bezier(0.22, 0.61, 0.36, 1)`
- **Count-up on scroll:** ease-out-expo, 1.4–1.6s, triggered by IntersectionObserver at threshold 0.2. Numbers use `fmtMoneyCompact` / `fmtCountCompact` formatters.
- **Hero reveal:** staggered phases at 120 / 400 / 700 / 1100 / 1500 / 1900 ms — kicker → headline line 1 → line 2 → line 3 + FL outline → lede + search → money clock.

### Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Scrollbar
```css
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #01010d; }
::-webkit-scrollbar-thumb { background: rgba(100,140,220,0.2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(100,140,220,0.4); }
```

---

## 7. Iconography

No icon library. Use Unicode glyphs only:

| Glyph | Meaning |
|---|---|
| `◤` | Section kicker prefix |
| `◆` | Emphasis marker (confirmed state, compact brand variants) |
| `→` | Inline forward action / "see more" |
| `↗` | External link |
| `↑` | "Back to top" |
| `⌕` | Search |
| `⌘K` | Keyboard shortcut in `<kbd>` tag |

The Florida silhouette is the only custom shape. Do not introduce new icons; do not install Lucide / Heroicons / Font Awesome.

---

## 8. Data Formatting

> **Canonical implementations live in `lib/fmt.js`. Do not redefine these — import and use them.**

```js
import { fmtMoney, fmtMoneyCompact, fmtCount, fmtCountCompact, fmtDate } from '@/lib/fmt';
```

### Function inventory

| Function | Output | When to use |
|---|---|---|
| `fmtMoney(n)` | `"$1,234,567.89"` — full precision, comma-separated | Hero totals, money clock, exact-amount inspectors, profile-page topline, anywhere the reader needs the real number |
| `fmtMoneyCompact(n)` | `"$1.2M"` / `"$89K"` / `"$3.9B"` | Stat cards, table cells, ticker rail, chart tick labels, hub-card rollups |
| `fmtCount(n)` | `"1,234,567"` — full, comma-separated | Exact row counts ("1,204 filings"), profile totals |
| `fmtCountCompact(n)` | `"1.2M"` / `"12K"` | Summary stats, kickers, chart ticks, any place space is tight |
| `fmtDate(n)` | `"Mar 15, 2024"` — mixed case, includes year | Trust ribbons, filing timestamps, profile metadata, anywhere the full date matters |

### Display-context rule of thumb
- **Does the reader need to compare exact dollars?** → `fmtMoney`.
- **Is it in a cell, card, chart axis, or rail where width is constrained?** → `fmtMoneyCompact` / `fmtCountCompact`.
- **Is it a trust-ribbon or "last filed" line?** → `fmtDate`.

### Tabular-nums everywhere
Any element containing numeric output must carry `font-variant-numeric: tabular-nums`. Money cells additionally use `letter-spacing: -0.01em` and `text-align: right`.

### The uppercase short-date (`MAR 31`, `APR 18 2026`)
Used in kickers, ticker timestamps, and table date columns — mono, `0.08em` tracking, UPPERCASE. **There is no named formatter for this.** Produce it inline: `fmtDate(n).toUpperCase()` + a `.slice()` as needed. Do not invent a helper; document one here if it's ever added to `lib/fmt.js`.

---

## 9. Complete CSS Token File (drop-in)

Save as `styles/tokens.css` and import globally.

```css
:root {
  /* Typography */
  --font-serif: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
  --font-sans:  'Instrument Sans', system-ui, sans-serif;
  --font-mono:  'JetBrains Mono', 'Courier New', monospace;

  /* Surfaces */
  --bg:         #01010d;
  --surface:    #080818;
  --surface-2:  #0d0d24;

  /* Borders */
  --border:     rgba(100, 140, 220, 0.18);
  --border-hi:  rgba(100, 140, 220, 0.36);

  /* Text */
  --text:       #c8d8f0;
  --text-dim:   #7a8eaa;
  --text-mute:  rgba(122, 142, 170, 0.5);

  /* Semantic accents */
  --brand:       #ffb060;  /* identity, money, italic accent, donor/candidate links */
  --interactive: #4dd8f0;  /* links, hover, active, committee/lobbyist/legislator links */
  --live:        #80ffa0;  /* live / new / fresh / confirmed */
  --warn:        #ffd060;  /* caveats, inferred */
  --blue:        #a0c0ff;  /* industries + Individual entity type, CLASSIFIED confidence */
  --rep:         #f87171;  /* party-R data only */
  --dem:         #60a5fa;  /* party-D data only */
  --purple:      #c084fc;  /* influence / lobbying */

  /* Legacy aliases — delete once migration is complete */
  --orange: var(--brand);
  --teal:   var(--interactive);
  --green:  var(--live);
  --gold:   var(--warn);

  /* Radii */
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius-md: 4px;

  /* Container */
  --container: 1100px;
  --gutter: 24px;
}
```

---

## 10. Data Display Patterns

Sections 11–15 cover the patterns that sit on top of the foundations (§§1–9). They share the same rule: every data surface has a source, a scope, and a next step.

---

## 11. Charts & Visualization (Recharts)

Recharts renders SVG, and **SVG `fill`/`stroke` attributes do not resolve CSS variables.** Use hex values in chart props; use CSS vars everywhere else.

### Chart container

```css
border: 1px solid var(--border);
border-radius: 4px;
padding: 1rem;
background: transparent;
```

No chart title *inside* the container. Use the §5.8 Section Header pattern (kicker + serif H2 + sub caption) *above* the container.

### Colors (hex only, for SVG fill/stroke)

| Semantic role | Hex | Token equivalent |
|---|---|---|
| Primary series (money, contributions) | `#ffb060` | `--brand` |
| Secondary series (counts, hover, links) | `#4dd8f0` | `--interactive` |
| Tertiary series (live / new / fresh) | `#80ffa0` | `--live` |
| Caution / inferred series | `#ffd060` | `--warn` |
| Industries / individual | `#a0c0ff` | `--blue` |
| Republican bars | `#f87171` | `--rep` |
| Democratic bars | `#60a5fa` | `--dem` |
| Lobbying / influence bars | `#c084fc` | `--purple` |
| Axis & tick text | `#7a8eaa` | `--text-dim` |
| Grid/axis lines | `#1a1a3a` | — (derived from bg) |
| Tooltip bg | `#0d0d24` | `--surface-2` |
| Tooltip border | `rgba(100,140,220,0.36)` | `--border-hi` |

### Recharts prop conventions

```jsx
<CartesianGrid stroke="#1a1a3a" strokeDasharray="2 4" />
<XAxis tick={{ fill: '#7a8eaa', fontSize: 10, fontFamily: 'JetBrains Mono' }}
       stroke="#1a1a3a" strokeWidth={1} />
<YAxis tick={{ fill: '#7a8eaa', fontSize: 10, fontFamily: 'JetBrains Mono' }}
       stroke="#1a1a3a" strokeWidth={1}
       tickFormatter={fmtMoneyCompact} />
<Tooltip contentStyle={{
  background: '#0d0d24',
  border: '1px solid rgba(100,140,220,0.36)',
  borderRadius: 3,
  fontFamily: 'JetBrains Mono',
  fontSize: 11,
  color: '#c8d8f0',
}}/>
<Bar dataKey="amount" fill="#ffb060" />
```

### Sizing

| Context | `<ResponsiveContainer>` height |
|---|---|
| Primary chart on a page | `260` |
| Inline / sparkline / secondary | `180` |
| Mobile (`< 640px`) | `130` |

### Chart rules
- **One series = one color.** Do not introduce a palette across a single bar chart.
- **No 3D, no drop shadows, no rounded bars > `radius: [2,2,0,0]`.**
- **Tabular numerics** on all numeric tick labels.
- **Always format ticks** with `fmtMoneyCompact` / `fmtCountCompact`; never print raw integers and never use `fmtMoney` on an axis (it will clip).
- **Empty-data chart:** show the skeleton (§15), then the empty-state pattern (§14) below it. Never an empty `<svg>`.

---

## 12. Entity Link Colors

Entity type determines link color. Never use `var(--text)` on an entity link.

| Entity type | Token | Hex |
|---|---|---|
| Donor | `--brand` | `#ffb060` |
| Candidate | `--brand` | `#ffb060` |
| Politician / legislator-as-candidate | `--brand` | `#ffb060` |
| Committee / PAC | `--interactive` | `#4dd8f0` |
| Lobbying firm | `--interactive` | `#4dd8f0` |
| Legislator (in lobby / vote context) | `--interactive` | `#4dd8f0` |
| Industry | `--blue` | `#a0c0ff` |
| Individual (entity type badge) | `--blue` | `#a0c0ff` |

### Behavior
- **Rest:** entity color at 100%, no underline.
- **Hover:** same color, `rgba(255,255,255,0.04)` background wash, no underline.
- **Visited:** no visited state (semantic colors carry type, not history).
- **Inline in prose:** keep the entity color; do not neutralize it.

### In tables
Entity-name cells always use the entity color on the text (serif 15–16px). The row itself keeps its table hover (`rgba(77,216,240,0.04)`); don't double-color.

---

## 13. Profile Page Header

Every entity profile (politician, donor, committee, lobbyist, industry) opens with the same block.

```
[Back breadcrumb]   ← BackLinks · mono 10px · textDim · "←" prefix
[Entity-type badge] ← §5.7 confidence badge styling, entity color
[Serif name]        ← serif 28–32px · letter-spacing -0.015em
[Key stats row]     ← 3–4 stats, each: mono 9px caps label ABOVE serif 24–26px value
[Trust ribbon]      ← §5.7 trust ribbon: SOURCE · UPDATED · CONFIDENCE · methodology ↗
```

### Spec
```jsx
<div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: '1rem' }}>
    ← <a href="/donors">DONORS</a> · <span>{currentName}</span>
  </div>

  <EntityTypeBadge type="Committee" />

  <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: '-0.015em', margin: '0.5rem 0 1.25rem' }}>
    {entityName}
  </h1>

  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.75rem', marginBottom: '1rem' }}>
    <Stat label="TOTAL RAISED"  value={fmtMoney(raised)}  color="var(--brand)" />
    <Stat label="TOP RECIPIENT" value={topRecipient}       color="var(--text)" />
    <Stat label="LAST FILING"   value={fmtDate(last)}      color="var(--text)" />
    <Stat label="TRANSACTIONS"  value={fmtCount(n)}        color="var(--interactive)" />
  </div>

  <TrustRibbon source="FL Division of Elections" updated="Apr 18 2026" confidence="normalized" />
</div>
```

### Rules
- **No hero image.** The entity name *is* the hero.
- **No subtitle line of prose** above the stats. Metadata goes in the trust ribbon.
- **Stats row collapses** to 2 columns below 768px, never scrolls horizontally.
- **Breadcrumb links** follow §12 entity-link colors.
- **Legislator dual-color rule:** a legislator on their own profile page uses `--brand` (they are the subject, a named politician). A legislator appearing in a lobbying roster, vote table, or other cross-link context uses `--interactive` (they are a cross-link target in a different context).

---

## 14. Empty States & Errors

Every empty/error state follows one of three patterns.

### 14A. Empty data (expected — no rows match the filter)

```css
padding: 2rem;
text-align: center;
font-family: var(--font-mono);
font-size: 12px;
color: var(--text-dim);
border: 1px solid var(--border);
border-radius: 3px;
background: rgba(255,255,255,0.015);
```

Rules:
- **Always state the scope.** *"No contributions in Q1 2026"* — not *"No results."*
- **Always offer a next step.** A redirect link in `--interactive`, with `→`.
- **No illustrations, no emoji, no 404 mascots.**

### 14B. Not-found (URL wrong or entity missing)

Same styling as 14A plus a breadcrumb back to the parent directory.

```
NO MATCH FOR "patricia-sutton-pac"

BROWSE COMMITTEES →       SEARCH →
```

### 14C. Error / timeout (server problem, not user error)

```css
border: 1px solid rgba(255,208,96,0.33);  /* --warn 55 */
background: rgba(255,208,96,0.03);
```

Body: *"Data temporarily unavailable — try again in a moment."* Link: *"→ methodology"*. **Never show a stack trace or raw HTTP code.**

### Rules (all three)
- `text-align: center`, `padding: 2rem` minimum.
- Width matches its container; do not center on the page viewport.
- No retry spinner — if retrying, show the skeleton (§15) instead and log silently.

---

## 15. Loading & Skeleton States

```css
.skeleton-row {
  background: var(--border);
  border-radius: 3px;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}
```

> **Migration note.** Current `globals.css` has `0.2` / `0.45` — too faint against `#01010d`. Update to `0.4` / `0.8` when touching the file.

### Heights

| Placeholder for | Height | Width |
|---|---|---|
| Body text row | `12px` | 60–100% of container |
| Label / caption row | `10px` | 30–50% |
| Stat block (card value) | `32px` | 50–70% |
| Entity-name line | `20px` | 60–80% |
| Money line | `28px` | 40–60% |
| Chart placeholder | `180px` or `260px` | `100%` |
| Table row | `40px` | `100%` |

### Rules
- **Skeleton first, spinner never.**
- **Match the real row count** when possible.
- **No shimmer gradient effects.** Opacity pulse only.
- Animation is optional under `prefers-reduced-motion: reduce`.

### Vary skeleton width
```jsx
const w = 60 + ((i * 37) % 40);   // 60–99%
<div className="skeleton-row" style={{ width: `${w}%`, height: 12 }} />
```

---

## 16. Checklist for Claude Code

When updating an existing page, verify every item:

**Foundations**
- [ ] `--bg` is `#01010d` (not `#000`, not `#0a0a0a`).
- [ ] Default body font is `JetBrains Mono`, not Inter / Arial / system.
- [ ] All headlines use `Instrument Serif` (not Georgia unless explicitly inline).
- [ ] All kickers, labels, timestamps, and meta use mono with 0.1–0.2em tracking, UPPERCASE.
- [ ] Page max-width target is 1100px, gutters `1.5rem` (phased — don't globally replace 900px).
- [ ] Spacing values come from the `rem` scale in §4.

**Tone (§1)**
- [ ] Page is tagged 1A or 1B and its copy matches that voice.
- [ ] No editorial framing on 1A surfaces; no italic accent phrases; no "sunny place for shady people."
- [ ] Puns/atmosphere only on 1B surfaces, and every 1B headline still lands on a named donor, dollar, or date.

**Color**
- [ ] Accent tokens used: `--brand`, `--interactive`, `--live`, `--warn`, `--blue`. Each section uses one.
- [ ] `--rep` / `--dem` appear only on party identification, never as UI accents.
- [ ] `CLASSIFIED` badge uses `--blue`, not `--rep`.
- [ ] Legacy aliases (`--orange`/`--teal`/`--green`/`--gold`) still present or cleanly removed — no split usage in one file.

**Components**
- [ ] Card border-radii are 2–4px — never 6px, never pills.
- [ ] Hub card has no hover shadow (border-color change only).
- [ ] Entity links follow §12 (donor/candidate = brand, committee/lobbyist/legislator = interactive, industry = blue).
- [ ] Profile pages follow the §13 header pattern.
- [ ] No shadows on cards/buttons — only the popover shadow is allowed.
- [ ] Bold weights appear only in mono (wordmarks, nav, hub titles), never on Instrument Serif.

**Data**
- [ ] Money values use `fmtMoney` (exact) or `fmtMoneyCompact` (tight contexts); counts use `fmtCount` / `fmtCountCompact`; every numeric element has `tabular-nums`.
- [ ] Every data section has a source + updated date + confidence trust ribbon.
- [ ] Charts use the hex palette in §11 (Recharts can't read CSS vars in SVG attrs).
- [ ] Chart axis stroke is `#1a1a3a`; tick text is `#7a8eaa` JetBrains Mono 10px.
- [ ] Empty states follow §14 (scope stated + next-step link, never bare "No results").
- [ ] Loading uses `skeleton-row` from §15, not a spinner.

**Chrome**
- [ ] Florida outline appears in nav and footer with the mono wordmark.
- [ ] No gradients except the newsletter `brand08 → transparent` wash.
- [ ] No icon fonts; only the Unicode glyph set in §7.
- [ ] No emoji.
- [ ] Reduced-motion media query is present.
- [ ] Selection color override is present.

---

*End of brand guide.*
