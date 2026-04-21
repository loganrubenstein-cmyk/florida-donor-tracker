# Home Page Audit + Refactor Plan

**Date:** 2026-04-18
**Status:** IMPLEMENTED 2026-04-21 (Claude design handoff from floridainfluence.com-handoff.zip)
**Revert point:** `git checkout app/page.js` (already done)

## Audit findings

### What works
- Editorial voice: Instrument Serif + mono + "sunny place for shady people" stamp
- Dark terminal/newspaper hybrid — distinctive vs. competitor (floridamoneytracker.org) clean white
- Data density in the right places

### Critical issues

**1. The differentiator is buried.**
`$34.9B Lobbying` is the biggest competitive moat — it sits as a tiny pill between 4 other equal pills. "Shadow PAC Networks" and "Official Disclosures" are rendered at the same weight as the generic "Campaign Finance" tag.
*Fix:* Pull lobbying + shadow PACs into the one-line value prop under the hero as colored inline emphasis.

**2. Two competing "big number" rows stacked back-to-back.**
Stats Strip (`$3.9B / 883K / 5,974 / 7,172`) and Depth Differentiator (`$3.9B+ / $34.9B / 160 / 431`) both live in the top half doing the same job. The second is better (has the competitive differentiators).
*Fix:* Kill the first stats strip entirely. Keep Depth Differentiator.

**3. Hero CTA row = visual flat line.**
Four identical bordered arrow-links (`→ influence index`, `→ follow the money`, `→ 2026 races`, `→ legislature`). No hierarchy.
*Fix:* 1 primary filled orange button + 2 secondary ghost chips.

**4. Hardcoded race percentage bars (`pct: 62, 78, 44`).**
Fake progress bars on the 2026 race cards. For a data integrity brand, publishing fake visualizations is a credibility problem.
*Fix:* Remove the bars entirely (the `$` raised + PAC count is enough data).

**5. Subhead repeats the h1.**
H1: "Follow the money and influence in Florida politics."
Sub: "Follow the money. Connect the dots. Track every vote, lobbyist..."
*Fix:* Replace subhead with the moat one-liner:
> "The only Florida site that crosses [campaign finance], [$34.9B in lobbying], [shadow PAC networks], and the [legislature] — 30 years of public records, one investigation view."

**6. Section monotony.**
Every section is `uppercase-label / serif-heading / card-grid / dim-footer`. No rhythm. "Why Florida Influence is different", "Live · 2026 Cycle", "Explore the data" read identically.
*Fix:* Break 1–2 sections out of the template — a full-bleed quote/callout, a diagonal, an inverted bg, a map hero.

**7. No visual anchor.**
Competitor leads with a full-screen FL map. We have a small FL outline tucked top-right, hidden on mobile.
*Fix:* Consider a data-rich hero visual — live ticker bar, a dense committee-to-candidate mini-graph, an inflation heat-map of giving since 1996.

**8. Investigation Spotlight is buried.**
Most magazine-quality piece. Sits below the 2026 cards.
*Fix:* Promote to right after the hero (or after Pulse).

**9. MoneyClock + DidYouKnow + Pulse overlap.**
All three are "recent/notable activity" widgets stacked in the top third.
*Fix:* Keep MoneyClock in hero, Pulse immediately after. Drop DidYouKnow from home (or move to /about).

### Minor

- `HomeToolTabs` (homepage) and `ToolHubTabs` (/tools) are two separate tab systems doing nearly the same job. Pick one and share.
- "Updated {updatedDate}" at 0.68rem text-dim below the hero is almost invisible — should be a visible trust badge with a pulsing green dot + source line.
- `<a href=>` vs `<Link href=>` mixed throughout. Standardize on `Link`.
- Pills have no hover state — feel half-declarative. Make them clickable filters or demote to plain text tags.

## Suggested re-ordering

```
1. Hero (h1 + SHARPER subhead + search + ONE primary CTA + MoneyClock + live trust badge)
2. Investigation Spotlight  ← moved up
3. Pulse
4. Depth Differentiator (single stats row — kill the duplicate)
5. 2026 Cycle cards (without fake % bars)
6. Tools tabs
7. Top donor table
8. Email strip  ← moved to just above footer
```

## Phased implementation plan

### Phase 1 — Content sharpening (no structural change)
1. Sharpen subhead (remove redundancy with h1)
2. Remove fake race % bars
3. Kill duplicate stats strip
4. Simplify hero CTAs to 1 primary + 2 secondary
5. Promote "Updated {date}" to visible trust badge

### Phase 2 — Structural moves
6. Move InvestigationSpotlight up (right after hero)
7. Move EmailStrip to bottom
8. Remove DidYouKnow from home

### Phase 3 — Differentiator emphasis
9. Replace pill row with colored inline emphasis in subhead
10. (Optional) New hero visual — data-rich anchor

## Specific code changes (if resumed)

### Imports to remove from `app/page.js`
```js
import HeroCounter from '@/components/home/HeroCounter'      // unused
import AnimatedStat from '@/components/shared/AnimatedStat'  // only in killed stats strip
import MoneyLens from '@/components/shared/MoneyLens'        // only in killed stats strip
import DidYouKnow from '@/components/home/DidYouKnow'        // removed from home
```

### New subhead (replaces current `<p>` + `PILLS` array)
```jsx
<p style={{ fontSize: '0.92rem', color: 'var(--text)', opacity: 0.8, marginBottom: '1rem', maxWidth: '540px', lineHeight: 1.7 }}>
  The only Florida site that crosses <span style={{ color: 'var(--orange)' }}>campaign finance</span>, <span style={{ color: 'var(--teal)' }}>$34.9B in lobbying</span>, <span style={{ color: 'var(--gold)' }}>shadow PAC networks</span>, and the <span style={{ color: 'var(--blue)' }}>legislature</span> — 30 years of public records, one investigation view.
</p>
```

### Hero CTAs (1 primary + 2 secondary)
```jsx
<div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
  <a href="/influence" style={{
    background: 'var(--orange)', color: '#01010d',
    padding: '0.55rem 1.3rem', fontSize: '0.74rem', fontWeight: 700,
    borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
  }}>
    → Start with the Influence Index
  </a>
  <a href="/follow" style={{ border: '1px solid rgba(77,216,240,0.3)', color: 'var(--teal)', padding: '0.5rem 1rem', fontSize: '0.7rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
    follow a donor
  </a>
  <a href="/races/2026" style={{ border: '1px solid rgba(128,255,160,0.3)', color: 'var(--green)', padding: '0.5rem 1rem', fontSize: '0.7rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
    2026 races
  </a>
</div>
```

### Trust badge (replaces invisible "Updated" text)
```jsx
<div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px rgba(128,255,160,0.5)' }} />
  <span>Data updated {updatedDate}</span>
  <span style={{ color: 'rgba(200,216,240,0.2)' }}>·</span>
  <span>FL Division of Elections · FL Lobbyist Registration Office · LegiScan</span>
</div>
```

### Race cards — remove fake bars
Delete:
```jsx
<div style={{ marginTop: '0.75rem', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
  <div style={{ width: `${race.pct}%`, height: '100%', background: race.color, opacity: 0.6 }} />
</div>
```
And remove `pct: 62/78/44` from `RACES_2026` array.

### Section reorder
- Move `<InvestigationSpotlight />` to just before `<PulseSection />`
- Move `<EmailStrip />` to after the donor table
- Delete the entire "Stats Strip" section (lines ~213–234)
