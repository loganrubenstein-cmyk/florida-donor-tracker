# Florida Donor Tracker — Claude Code Instructions

## Project Overview

Public-facing Florida political finance tracker. Next.js 14+ App Router, plain JavaScript (no TypeScript), Supabase for all data. Dark-themed data-visualization UI.

**Brand & Design System:** `docs/BRAND_GUIDE.md` is the single source of truth for tokens, typography, color, spacing, components, and copy voice. Read it before making any UI changes. The §16 checklist must pass before marking any page update complete.

---

## Figma MCP Integration Rules

These rules define how to translate Figma inputs into code for this project and must be followed for every Figma-driven change.

### Required Flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s)
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s) with `get_design_context`
3. Run `get_screenshot` for a visual reference of the node variant being implemented
4. Only after you have both `get_design_context` and `get_screenshot`, start implementation
5. Translate the output (usually React + Tailwind) into this project's conventions — inline styles + CSS variables (see Styling Rules below)
6. Validate against Figma screenshot for 1:1 look and behavior before marking complete

### Implementation Rules

- Treat Figma MCP output as a design/behavior reference, **not** final code — it uses Tailwind; this project does not
- Replace every Tailwind utility class with inline `style={{}}` props using project CSS variables
- Reuse existing components from `components/shared/` before creating anything new
- Use the project's color tokens, typography, and spacing conventions consistently
- Respect existing patterns: server components by default, `'use client'` only when needed, `dynamic()` for heavy chart/graph components

---

## Component Organization

- `components/shared/` — reusable primitives used across multiple pages:
  - `TabbedProfile.js` — tab navigation with URL state (`?tab=`)
  - `DataTrustBlock.js` — data source + confidence metadata footer
  - `NewsBlock.js` — compact "In the News" article cards
  - `ConfidenceBadge.js` — direct/normalized/inferred/classified indicator
  - `EntityTypeBadge.js` — Individual, Corporation, PAC, Party, etc.
  - `BackLinks.js` — breadcrumb back-navigation
- `components/candidate/`, `components/committee/`, `components/donors/`, etc. — domain-scoped components mirroring route structure
- **IMPORTANT:** Place new shared UI primitives in `components/shared/`; domain-specific components go in their domain folder
- All components use **default exports**; PascalCase filenames

---

## Styling Rules

**This project uses inline styles + CSS variables. There is no Tailwind, no CSS Modules, no styled-components.**

### Design Tokens (CSS variables — defined in `app/globals.css`)

#### Colors
```
--bg:           #01010d        /* page background */
--surface:      #080818        /* card/panel background */
--border:       rgba(100,140,220,0.18)  /* subtle blue border */
--text:         #c8d8f0        /* primary text */
--text-dim:     #5a6a88        /* secondary/muted text */
--orange:       #ffb060        /* primary accent / CTA */
--teal:         #4dd8f0        /* secondary accent */
--republican:   #f87171        /* party color red */
--democrat:     #60a5fa        /* party color blue */
--blue:         #a0c0ff
--green:        #80ffa0
--gold:         #ffd060
```

#### Typography
```
--font-mono:    "Courier New", Courier, monospace   /* primary body font */
--font-serif:   'Instrument Serif', serif
--font-sans:    'Instrument Sans', sans-serif
```

### Rules
- **IMPORTANT: Never hardcode hex colors** — always use `var(--token-name)`
- **IMPORTANT: Never add Tailwind classes** — use inline `style={{}}` with CSS variables
- Font sizes: use `rem` units (typical range: `0.58rem` labels → `0.82rem` body → `1.1rem` headings)
- Spacing: use `rem` units consistently; common values `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.25rem`, `2rem`
- Borders: `1px solid var(--border)` with `borderRadius: '3px'` (project standard)
- Transitions: `transition: 'border-color 0.12s'` for hover states

### Global Utility Classes (from `app/globals.css`)
Prefer these over inventing new inline layout styles:
- `.container` — max-width 900px, centered
- `.hub-grid` — responsive card grid
- `.tool-grid-3` — 3-column tool layout
- `.rg-4`, `.rg-3`, `.rg-2` — responsive grid helpers
- `.tab-bar`, `.tab`, `.tab-active` — tab navigation
- `.hub-card` — card with hover state

---

## Data & Architecture

- **All data comes from Supabase** — no static JSON reads in profile pages
- Profile pages: `force-dynamic`, query via `lib/load*.js` helpers
- Directory pages: Supabase API routes under `app/api/`
- Path alias: `@/` maps to project root (e.g. `@/components/shared/NewsBlock`)
- Formatting utilities: `@/lib/fmt.js` — use `fmtMoney`, `fmtMoneyCompact`, `fmtCount`, `fmtDate`
- Slugs: `@/lib/slugify.js`

### Server vs Client Components
- Default: **server components** (no `'use client'`)
- Add `'use client'` only for interactive state (hover, tabs, toggles)
- Use `dynamic(() => import(...), { ssr: false })` for Recharts, Sigma/Graphology, and other heavy client libs

---

## Asset Handling

- **IMPORTANT: If the Figma MCP server returns a localhost source for an image or SVG, use that source directly**
- **IMPORTANT: Do NOT install new icon packages** — no icon libraries are used in this project; use inline SVG or Unicode if needed
- Static assets go in `public/`
- Data files go in `public/data/` (most are gitignored; served from Supabase instead)

---

## Code Conventions

- Plain JavaScript — no TypeScript, no PropTypes
- No comments unless logic is non-obvious
- No error handling for internal code paths; validate only at Supabase/API boundaries
- Don't add features beyond what's asked; no speculative abstractions
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel env vars — never hardcode
