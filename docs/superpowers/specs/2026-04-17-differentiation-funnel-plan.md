# Differentiation & Funnel Plan — Florida Donor Tracker
**Date:** 2026-04-17  
**Status:** Draft for review

---

## 1. The Competitive Landscape

| Site | Scope | Strength | Gap |
|---|---|---|---|
| OpenSecrets | Federal only | Deep federal data | Zero FL-specific tooling |
| FollowTheMoney.org | 50-state, generic | Broad coverage | Shallow per-state; no FL lobbying |
| FL Division of Elections | Raw filings | Authoritative | Zero UX, no analysis |
| Ballotpedia | Officeholders | Well-known brand | No transaction-level data |
| ProPublica Nonprofit Explorer | Federal + some FL | Credibility | Not campaign finance |
| ORCA (paid) | Campaign tools | Pro-grade | Paywall, no public access |
| Integrity Florida | Advocacy + reports | Narrative | No searchable database |

**Conclusion:** No site combines FL campaign finance + lobbying + shadow networks + legislature + tools in one free, searchable platform. That gap is the entire value proposition.

---

## 2. Core Differentiators (what no one else has)

### D1 — Only FL tool that crosses campaign finance + lobbying
OpenSecrets is federal. FollowTheMoney doesn't have FL lobbyist compensation. We have:
- 4M rows of lobbying compensation (19 years)
- Every lobbyist cross-referenced to their campaign donations
- Firm profiles with client books + compensation history

**Message to surface:** "See the whole picture — not just donations, but who's paying lobbyists too."

### D2 — Shadow network mapping
431 shadow PAC orgs documented. 56K+ committee-to-committee pairs. Connections page.
No other FL tool surfaces this.

**Message:** "Trace the money that doesn't want to be traced."

### D3 — Legislator integration
160 legislators with donor profiles, vote records, lobbyist connections, and financial disclosures — all linked.
No other site connects a vote on a specific bill to the donor funding that legislator.

**Message:** "See how your rep voted — then see who paid for their campaign."

### D4 — Free, no paywall, no signup
ORCA costs thousands. Lobbyist portals are clunky. We're free, no account required.

**Message:** "Public records should be public. No paywall, no signup."

### D5 — Journalist-grade + voter-friendly simultaneously
Most tools are either raw data dumps (government portals) or oversimplified (Ballotpedia). We serve both extremes.

**Message:** "Built for reporters. Designed for voters."

### D6 — 30-year depth + live 2026 data
1996–2026, updated quarterly. No other free FL tool has this historical range.

**Message:** "30 years of receipts."

---

## 3. Funnel Architecture

### Current funnel chain
```
Homepage
  → Tools Hub (/tools)
      → For Voters (/tools/voters)
          → Who Funds Your District (/who-funds)
          → 2026 Money Race (/races/2026)
          → Legislature (/legislature)
      → For Journalists (/tools/journalists)
          → Follow the Money (/follow)
          → Influence Index (/influence)
          → Committee Connections (/connections)
      → Deep Data (/tools/data)
          → Transaction Explorer (/explorer)
          → Election Cycles (/cycles)
          → Lobbying Principals (/principals)
```

### Funnel gaps to close

**Gap 1 — Homepage doesn't lead with differentiation**
Hero leads with features, not with "why us". Add 3-word differentiator line: "The only site that..." or a competitive callout.

**Gap 2 — No email conversion after key actions**
After a user runs "Follow the Money" or looks up their district, there's no prompt to subscribe for alerts.
Add post-action email prompt: "Want to be notified when [candidate] files next quarter?"

**Gap 3 — About page is a text wall, not a trust page**
Current About = plain text with caveats. Should be: mission statement + credibility stats + source logos + "built by" + contact.

**Gap 4 — No social proof**
No "as seen in", no press mentions, no journalist testimonials. If the site gets picked up by press, this needs a home.

**Gap 5 — Investigations page isn't prominently linked from homepage**
The best storytelling content on the site (Trulieve, US Sugar, FPL narratives) isn't discoverable from the homepage. Should have a "Latest Investigation" card or section.

**Gap 6 — Tools pages don't cross-sell to each other in context**
After a user sees their district money (who-funds), they should get a prompt: "Want to see how your rep voted?" → /legislature. These in-context CTAs aren't wired.

---

## 4. Pages to Build / Rebuild

### 4A — About page (rebuild as marketing page)
Replace current text wall with:
- Full-width mission statement banner
- 4-stat credibility bar (22M transactions, $34.9B lobbying, 30 years, 160 legislators)
- "How we're different" — 3 differentiator blocks (vs. raw portals, vs. federal-only sites, vs. paywalled tools)
- Data sources with logos/links (FL DOE, ELMO, LegiScan, USASpending)
- Update cadence + methodology link
- Press/contact section
- Site directory (keep, but make it a footer element not the main content)

### 4B — Homepage: add Investigation spotlight
Between "2026 Cycle" and "Tools" sections, add a single-card "Story of the week" or "Latest investigation" pull:
- Featured entity card from /investigations (Trulieve, US Sugar, etc.)
- Headline, amount, issue area badge, "→ read the full profile" CTA

### 4C — Post-action email capture (micro-conversion)
Add a small inline prompt after key tool interactions:
- After Follow the Money returns results: "Get alerts when [donor name] files" 
- After Who Funds returns results: "Get alerts for District [N]"
- These can use the existing email strip API (to be wired)

### 4D — Press / Contact stub page
Simple `/press` page:
- Elevator pitch (3 sentences)
- Data coverage summary
- Contact email for journalists and researchers
- Link to methodology, CSV export info

### 4E — Competitive callout section on homepage
Between the pills and MoneyClock, or in the Depth section:
- "The only Florida site that combines..." short bold statement
- 3-column: Campaign Finance / Lobbying / Shadow Networks
- Each column: count + source

---

## 5. Messaging Framework

### Primary message
**"The most complete picture of Florida political influence — free from public records."**

### Secondary messages by audience

**Voters:** "Know who's really behind your rep before you vote."  
**Journalists:** "Trace the money that doesn't want to be traced."  
**Researchers:** "30 years of FL political money, queryable to the transaction."

### Trust signals to surface on every page
- "Data from FL Division of Elections" (already in footer, should be more visible)
- "Free, no account required"
- "Updated quarterly"
- "Public records only — no paid data"

---

## 6. Implementation Priority

| # | Page / Feature | Impact | Effort | Do when |
|---|---|---|---|---|
| 1 | About page rebuild | High — trust/credibility | M | Now |
| 2 | Email capture API route | High — retention | S | Now |
| 3 | Investigation spotlight on homepage | High — engagement | S | Now |
| 4 | Post-action email prompts | Medium — conversion | M | After API |
| 5 | Press/contact page | Medium — journalist trust | S | After About |
| 6 | Competitive callout section | Medium — differentiation | S | After About |
| 7 | In-context cross-tool CTAs | Medium — depth | L | Later |

---

## 7. Email Alert System (scope)

**MVP (now):** Collect email + optional "notify for" context. Store in Supabase `email_signups` table. No sending yet.

**API route:** `POST /api/subscribe` — body: `{ email, context? }` — upsert to `email_signups(email, context, created_at)`.

**Trigger points:** 
- Homepage email strip (already in UI, just needs wiring)
- Post-Follow-the-Money results
- Post-Who-Funds results
- Footer of every funnel landing page

**Supabase table:**
```sql
CREATE TABLE email_signups (
  id bigserial primary key,
  email text not null,
  context text,
  created_at timestamptz default now(),
  UNIQUE(email)
);
```
