# Tool Hub Redesign — Design Spec
**Date:** 2026-04-17  
**Status:** Approved

---

## Overview

Redesign `/tools` from a flat 10-card grid into a structured hub with:
1. Audience-based tabbed funneling (For voters / For journalists / Deep data)
2. Per-tab sidebar with hook headline + example queries
3. Per-tab curated tool list (4–5 tools)
4. "All tools" flat index below for direct access

---

## URL & Route
`/tools` — replaces the existing flat grid. No new route needed.

---

## Page Structure

### Header
- Breadcrumb: `Home / Tools`
- H1: `Explore the data` (serif, 1.8rem, weight 400)
- Subtext: "Three ways in — pick the one that matches your question, or jump straight to any tool below."

---

## Tab Bar
Three tabs, client-side JS switching. No page reload.

| Tab | Active color | Panel ID |
|---|---|---|
| For voters | `--teal` | `panel-voter` |
| For journalists | `--orange` | `panel-journalist` |
| Deep data | `--blue` | `panel-data` |

---

## Tab Panels
Each panel: `display: grid; grid-template-columns: 260px 1fr; gap: 2.5rem`

### Sidebar (left, 260px)
- **Hook** — serif, 1.05rem, colored per tab — a question in quotes that frames the audience's goal
- **Body** — 0.77rem dim, 2 sentences orienting the user
- **"Try asking"** label + 4 clickable example query chips (clicking could pre-fill a search in future)

### Tool list (right)
- 4–5 tool cards per tab
- First card is `featured` (subtle tinted border + background)
- Each card: `→ tool name` (colored, monospace bold) + description (0.75rem, 60% opacity)
- "New" green badge on tools not yet built

### Tab content

**For voters (teal)**
- Hook: *"Who's bankrolling the people who represent me?"*
- Featured: → who funds your district (New)
- → 2026 money race (New)
- → legislature
- → district money map
- → pulse

**For journalists (orange)**
- Hook: *"Follow the money — through PACs, lobbyists, and shadow networks."*
- Featured: → follow the money
- → influence index
- → committee connections
- → money flow explorer
- → party cross-reference

**Deep data (blue)**
- Hook: *"Give me the full picture — every transaction, every cycle."*
- Featured: → transaction explorer
- → industries
- → election cycles 2008–2026
- → lobbying principals
- → money timeline

---

## All Tools Flat Index
Below the tab panels, separated by a border-top.

Label: `ALL TOOLS — QUICK ACCESS` (0.62rem, uppercase, dim)

4-column grid of compact cards. Each: tool name (0.71rem, bold) + one-line description (0.64rem, dim).

**Tools in index (16 total):**
Follow the Money · Influence Index · Money Flow Explorer · Committee Connections · Who Funds Your District · 2026 Money Race · Transaction Explorer · District Money Map · Legislature · Industries · Lobbying Principals · Election Cycles · Donor Overlap · Committee Decoder · Party Cross-Reference · Pulse

---

## New Tools Required
Two tools listed as "New" need to be built:
- **Who funds your district** — `/district-lookup` or `/who-funds` — zip code → rep → donor breakdown
- **2026 Money Race** — `/races/2026` — live fundraising rankings per race with hard/soft split

These are referenced in the tool hub but implementation is separate.

---

## Implementation Notes
- Tab switching: client-side JS only, no router changes needed
- `'use client'` on the page since tabs require state
- Flat index always visible (no tab dependency)
- Mobile: sidebar stacks above tool list; tabs scroll horizontally
