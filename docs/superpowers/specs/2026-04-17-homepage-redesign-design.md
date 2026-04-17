# Homepage Redesign — Design Spec
**Date:** 2026-04-17  
**Status:** Approved

---

## Overview

Redesign the Florida Donor Tracker homepage to:
1. Reposition the site as a comprehensive *political influence* tracker (not just campaign finance)
2. Surface 2026 election urgency without losing historical depth
3. Add email alert capture
4. Preserve and elevate existing interactive elements (MoneyClock, DidYouKnow)
5. Widen layout from 900px to 1140px to use available screen space

---

## Page Width
All sections: `max-width: 1140px` (was `900px`)

---

## Section 1 — Hero

### Layout
Two-column flex: left = headline + body, right = FL outline + stamp. Right column hides on mobile.

### Headline
```
Follow the money
and influence          ← "and influence" in var(--orange)
in Florida politics.
```
Font: `var(--font-serif)`, `clamp(1.9rem, 4.5vw, 3rem)`, weight 400.

### Subtext
> Follow the money. Connect the dots. Track every vote, lobbyist, and legislator. From campaign donations to contracts — the most complete picture of Florida political influence, free from public records.

### Right column: FL outline + stamp
- `<FloridaOutline size="hero" />` at opacity 0.9 (original)
- Below it: rubber-stamp element — `font-size: 0.65rem`, monospace, uppercase, orange border + text, `rotate(-1.5deg)`, `opacity: 0.82`
- Stamp text: **"florida: a sunny place for shady people."**
- Animation: `stamp-press` keyframe (scale 1.2→0.96→1.03→1, opacity 0→1), 0.55s, 0.8s delay on page load

### Differentiator pills (below subtext)
Row of small pill badges: Campaign Finance · $34.9B Lobbying · Official Disclosures · Shadow PAC Networks · Legislature  
Colors: neutral/white, teal, blue, gold, dim respectively.

### MoneyClock (live ticker box)
Boxed element below pills, before search. Max-width 520px.
- Label: `LIVE · SINCE YOU OPENED THIS PAGE` (0.6rem, dim, uppercase)
- Body: "FL politicians have raised approximately **$X**" — body 0.88rem, value 1rem bold orange
- Ticking at 1s interval, rate = $3.894B / 30 years

### Search bar
Standard search row (max-width 500px) → `/search`

### CTA links
`→ influence index` (orange) · `→ follow the money` (teal) · `→ 2026 races` (green) · `→ legislature` (blue)

### Did You Know
- Border-top separator
- Label: 0.66rem dim uppercase
- Fact text: **0.88rem**, `rgba(200,216,240,0.75)`, rotates every 7s with 350ms fade
- Max-width 600px

---

## Email Alert Strip (between Depth and 2026 sections)
Full-width strip, `background: rgba(255,176,96,0.03)`, flex row.
- Left: "Get filing alerts" (0.78rem bold) + "New filings drop · Major donors · Per-candidate alerts available after signup" (0.68rem dim)
- Right: email input + orange Subscribe button
- Email system to be built separately (see email alerts spec)

---

## Section 2 — Depth Differentiator

Label: **"Why Florida Donor Tracker is different"**

2×2 stat grid:
| Stat | Color | Detail |
|---|---|---|
| $3.9B+ | orange | campaign contributions · 22M transactions · 883K donors · 1996–2026 |
| $34.9B | teal | lobbying compensation · 4M rows · 2,473 lobbyists · 19 years |
| 160 | green | current FL legislators · donors · votes · lobbyist connections · disclosures |
| 431 | blue | shadow PAC orgs · 56K+ committee pairs |

---

## Section 3 — 2026 Cycle

Badge: `Live · 2026 Cycle` (teal)  
Headline: "The races that will decide Florida"

Race cards grid (3 col): Governor, U.S. Senate, AG — showing leader, amount raised + affiliated PACs, progress bar.

Tool entry links: → all 2026 races · → who funds your district · → money + lobbying combined · → hard vs. soft money · → out-of-state donors

---

## Section 4 — Tools (tabbed)

Tabs: **Voter tools** | Money flow | Deep research | Data

Voter tools (default tab) surfaces: who funds your district (New), follow the money, 2026 money race (New), influence index, legislature.

"New" badges on tools to be built: who funds your district, 2026 money race.

---

## Removed from current homepage
- `Florida Political Influence · 1996–2026 · Public Record` label
- Orange on h1 accent replaced by orange (kept — user confirmed)
- Flat 3-column tool cards replaced by tabbed layout
- `max-width: 900px` → `1140px`

---

## Interactive Elements (preserved)
- `<MoneyClock />` — elevated to boxed "live" element with label, larger text
- `<DidYouKnow />` — larger text (0.88rem), more breathing room
- `<FloridaOutline size="hero" />` — restored to original opacity, right column
- `<HeroCounter />` — retained in stats strip (animated spending counter)
- `<AnimatedStat />` — retained in stats strip
- `<PulseSection />` — retained below hero
