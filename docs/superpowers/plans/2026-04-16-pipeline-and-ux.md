# Pipeline & UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three frontend UX fixes, run all pending pipeline scripts in dependency order, and backfill legislator_votes.bill_number to unlock the Bill Money Map.

**Architecture:** Track A edits three existing frontend files. Track B runs pre-written Python pipeline scripts in order; the only new script is `100_apply_name_aliases.py` for the manual alias table. Track C writes `76_backfill_bill_numbers.py` to join LegiScan bill data into legislator_votes.

**Tech Stack:** Next.js 14 (frontend), Python 3 / psycopg2 / rapidfuzz (pipeline), Supabase (DB).

---

## File Map

**Track A — Frontend:**
- Modify: `components/committee/CommitteeConnections.js` — add `toTitle()` to `otherName`
- Modify: `components/explorer/TransactionExplorer.js` — add group labels to filter grid
- Modify: `app/page.js` — swap column 1 and column 3 in the feature grid

**Track B — Pipeline (all scripts pre-exist except one):**
- Run: `scripts/86_ghost_slug_report.py` → outputs `data/logs/ghost_remaps_*.csv`
- Run: `scripts/86b_apply_ghost_remaps.py` → applies confident remaps
- Create: `scripts/100_apply_name_aliases.py` — DNC / FL REALTORS / LAS VEGAS SANDS manual fix
- Run: `scripts/85_reconcile_donor_aggregates.py` — re-aggregate after remaps
- Run: `scripts/97_import_sunbiz_corporations.py` — Sunbiz SFTP bulk corp data
- Run: `scripts/98_scrape_ethics_disclosures.py` — FL Ethics financial disclosures
- Run: `scripts/94_import_fl_contracts.py` → `scripts/95_load_contracts_supabase.py`
- Run: `scripts/09_deduplicate_donors.py` — rebuild contributions_deduped.csv including 70275

**Track C — Bill Number Backfill:**
- Create: `scripts/76_backfill_bill_numbers.py` — joins LegiScan bill JSON → legislator_votes

---

## Task A1: Fix all-caps names in CommitteeConnections

**Files:**
- Modify: `components/committee/CommitteeConnections.js:41-43`

The `ConnectionsView.js` (standalone `/connections` page) already applies `toTitle()`.
`CommitteeConnections.js` (committee profile sidebar) renders `otherName` raw — still all-caps.

- [ ] **Add `toTitle` helper and apply it**

Replace the top of `CommitteeConnections.js` (after the import line) and the `otherName` render:

```js
// Add after the import line at top of file:
const CAPS_KEEP = new Set(['PAC', 'LLC', 'ECO', 'NOP', 'DBA', 'INC', 'II', 'III', 'IV', 'PC', 'LP', 'LLP']);
function toTitle(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w+/g, w =>
    CAPS_KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  );
}
```

Then change line 42:
```js
// Before:
const otherName = isSideA ? conn.entity_b : conn.entity_a;

// After:
const otherName = toTitle(isSideA ? conn.entity_b : conn.entity_a);
```

- [ ] **Commit**

```bash
git add components/committee/CommitteeConnections.js
git commit -m "fix: title-case committee names in CommitteeConnections sidebar"
```

---

## Task A2: Group Transaction Explorer filters

**Files:**
- Modify: `components/explorer/TransactionExplorer.js:195-254`

The flat 8-input grid is dense. Add three section labels — WHO, WHEN, HOW MUCH — as dividers inside the grid using `grid-column: 1 / -1` to span the full row.

- [ ] **Add group dividers to filter grid**

Replace the opening of the filter panel div (around line 196) with this version that inserts three `<div>` group headers using `gridColumn: '1 / -1'`:

```jsx
<div style={{
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '0.75rem', padding: '1rem', background: 'rgba(8,8,24,0.6)',
  border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '1rem',
}}>
  {/* WHO group */}
  <div style={{ gridColumn: '1 / -1', fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.1rem' }}>
    Who
  </div>
  <FilterInput label="Contributor name" value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="First or last name…"
    hint={q.trim().includes(' ') ? 'Each word must appear — results may include similar names' : 'Matches any name containing this text'} />
  {!initialRecipientAcct && (
    <FilterInput label="Recipient acct #" value={recipAcct} onChange={v => { setRecipAcct(v); setPage(1); }} placeholder="e.g. 4700" />
  )}
  {!initialDonorSlug && (
    <FilterInput label="Donor slug" value={donorSlug} onChange={v => { setDonorSlug(v); setPage(1); }} placeholder="e.g. john-smith" />
  )}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Recipient type
    </label>
    <select
      value={recipType}
      onChange={e => { setRecipType(e.target.value); setPage(1); }}
      disabled={!!initialRecipientType}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        color: 'var(--text)', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
        borderRadius: '3px', fontFamily: 'var(--font-mono)',
        opacity: initialRecipientType ? 0.5 : 1,
      }}
    >
      <option value="">Both</option>
      <option value="committee">Committee</option>
      <option value="candidate">Candidate</option>
    </select>
  </div>

  {/* WHEN group */}
  <div style={{ gridColumn: '1 / -1', fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.1rem', marginTop: '0.25rem' }}>
    When
  </div>
  <FilterInput label="Year" value={year} onChange={v => { setYear(v); setPage(1); }} placeholder="e.g. 2022" type="number" />
  <FilterInput label="Date start" value={dateStart} onChange={v => { setDateStart(v); setPage(1); }} placeholder="YYYY-MM-DD" />
  <FilterInput label="Date end" value={dateEnd} onChange={v => { setDateEnd(v); setPage(1); }} placeholder="YYYY-MM-DD" />

  {/* HOW MUCH group */}
  <div style={{ gridColumn: '1 / -1', fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.1rem', marginTop: '0.25rem' }}>
    How Much
  </div>
  <FilterInput label="Amount min ($)" value={amountMin} onChange={v => { setAmountMin(v); setPage(1); }} placeholder="e.g. 1000" type="number" />
  <FilterInput label="Amount max ($)" value={amountMax} onChange={v => { setAmountMax(v); setPage(1); }} placeholder="e.g. 50000" type="number" />
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Type
    </label>
    <select
      value={txType}
      onChange={e => { setTxType(e.target.value); setPage(1); }}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        color: 'var(--text)', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
        borderRadius: '3px', fontFamily: 'var(--font-mono)',
      }}
    >
      <option value="">All types</option>
      <option value="CHE">Check (CHE)</option>
      <option value="MON">Monetary (MON)</option>
      <option value="INK">In-Kind (INK)</option>
      <option value="LOA">Loan (LOA)</option>
      <option value="CAS">Cash (CAS)</option>
    </select>
  </div>
</div>
```

- [ ] **Commit**

```bash
git add components/explorer/TransactionExplorer.js
git commit -m "ux: group transaction explorer filters into Who/When/How Much sections"
```

---

## Task A3: Move "How money moved" to column 1 on homepage

**Files:**
- Modify: `app/page.js:265-315`

At 900px the grid becomes 2 columns. Column 3 drops below columns 1 and 2 — so "How money moved" gets buried. Fix: swap column 3 (How money moved) with column 1 (Who gave). "Who gave" has more items and is less immediately compelling as an entry point than the network tools. "How money moved" should be the lead on mobile.

- [ ] **Swap column order in the feature grid**

In `app/page.js`, reorder the three column divs inside `<div className="tool-grid-3">` so the order is:
1. How money moved (was 3rd)
2. Who got paid (stays 2nd)
3. Who gave (was 1st)

The full replacement is the three `{/* Column N */}` blocks — just cut "Column 3 — How money moved" div and paste it before "Column 1 — Who Gave":

```jsx
<div className="tool-grid-3">

  {/* Column 1 — How Money Moved (moved to front for mobile visibility) */}
  <div>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
      How money moved
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <CardLink href="/flow" color="var(--teal)" accent="rgba(77,216,240,0.2)" title="→ flow explorer" desc="Click through donors, committees, candidates, and industries. Follow money in any direction." />
      <CardLink href="/flow" color="var(--teal)" accent="rgba(77,216,240,0.15)" title="→ money flow" desc="Sankey of the largest donor-to-committee flows. Filter by cycle, industry, or party." />
      <CardLink href="/ie" color="var(--orange)" accent="rgba(255,176,96,0.15)" title="→ independent expenditures" desc="$70.9M in IE spending — committees that ran ads for and against candidates outside their campaigns." />
      <CardLink href="/connections" color="var(--orange)" accent="rgba(255,176,96,0.12)" title="→ committee connections" desc="56K+ committee pairs sharing treasurers, addresses, donors, or money. Shadow networks mapped." />
      <CardLink href="/search" color="var(--orange)" accent="rgba(255,176,96,0.35)" title="→ global search" desc="Search everything — donors, committees, candidates, lobbyists. 20K+ entities." highlight />
    </div>
  </div>

  {/* Column 2 — Who Got Paid */}
  <div>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
      Who got paid
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <CardLink href="/candidates" color="var(--blue)" accent="rgba(160,192,255,0.2)" title="→ candidates" desc="Every FL candidate — hard money raised, linked PACs, soft money, career totals." />
      <CardLink href="/committees" color="var(--green)" accent="rgba(128,255,160,0.2)" title="→ committees" desc="5,974 PACs, ECOs, and party committees. See every donor and where the money went." />
      <CardLink href="/cycles" color="var(--green)" accent="rgba(128,255,160,0.15)" title="→ election cycles" desc="2008–2026: totals by cycle, top raisers, party splits, office breakdown." />
      <CardLink href="/investigations" color="var(--orange)" accent="rgba(255,176,96,0.25)" title="→ investigations" desc="11 entities with documented political influence, cross-referenced with journalism." />
      <CardLink href="/legislature" color="var(--gold)" accent="rgba(255,208,96,0.12)" title="→ legislature" desc="All 160 current FL House + Senate members — their donors, votes, and committee assignments." />
      <CardLink href="/elections" color="var(--blue)" accent="rgba(160,192,255,0.12)" title="→ elections" desc="FL results 2012–2024. Finance-matched breakdowns, cost per vote, margin vs. money." />
      <CardLink href="/party-finance" color="var(--teal)" accent="rgba(77,216,240,0.1)" title="→ party finance" desc="Republican vs Democrat fundraising by year and office. 30-year trend." />
      <CardLink href="/contracts" color="var(--gold)" accent="rgba(255,208,96,0.15)" title="→ state contracts" desc="FL vendors who got state contracts — matched against campaign donors." />
      <CardLink href="/federal-contracts" color="var(--green)" accent="rgba(128,255,160,0.1)" title="→ federal contracts" desc="$219B in federal awards to FL recipients — mapped to donors and state vendors." />
    </div>
  </div>

  {/* Column 3 — Who Gave */}
  <div>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
      Who gave
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <CardLink href="/donors" color="var(--orange)" accent="rgba(255,176,96,0.2)" title="→ donors" desc="883K deduped donor profiles. Search by name, see total giving across all committees and candidates." />
      <CardLink href="/explorer" color="var(--orange)" accent="rgba(255,176,96,0.35)" title="→ transaction explorer" desc="Every contribution row — filter by name, amount, date, or recipient." highlight />
      <CardLink href="/industries" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ industries" desc="Which sectors — Legal, Real Estate, Healthcare — fund which candidates and how much." />
      <CardLink href="/lobbyists" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ lobbyists" desc="2,473 registered FL lobbyists, their clients, their bills, and their campaign donations." />
      <CardLink href="/principals" color="var(--green)" accent="rgba(160,192,255,0.2)" title="→ principals" desc="Lobbying clients matched to their campaign contributions — see the full spend." />
      <CardLink href="/lobbying/bills" color="var(--blue)" accent="rgba(160,192,255,0.1)" title="→ lobbied bills" desc="14K FL House bills tagged by lobbying activity 2017–2026. Who pushed what." />
      <CardLink href="/influence" color="var(--orange)" accent="rgba(255,176,96,0.2)" title="→ influence index" desc="Orgs ranked by combined lobbying + donations. The most comprehensive political spending index in FL." highlight />
    </div>
  </div>

</div>
```

- [ ] **Commit**

```bash
git add app/page.js
git commit -m "ux: move 'How money moved' to column 1 for mobile visibility"
```

---

## Task B1: Run ghost slug report (script 86)

Script 86 identifies contribution rows whose `donor_slug` has no `donors` entry — the giving is invisible on any donor profile. Outputs two CSVs then exits (no DB writes).

- [ ] **Run the report**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
.venv/bin/python scripts/86_ghost_slug_report.py
```

Expected output: prints ghost slug count, total dollars, outputs `data/logs/ghost_slugs_YYYY-MM-DD.csv` and `data/logs/ghost_remaps_YYYY-MM-DD.csv`.

- [ ] **Review the remaps CSV**

```bash
cat data/logs/ghost_remaps_$(date +%Y-%m-%d).csv | head -30
```

Verify: `ghost_slug`, `proposed_slug`, `confidence` columns. Only keep rows where you agree with the mapping. Delete any rows you're unsure about. The next step applies every remaining row.

---

## Task B2: Apply ghost remaps (script 86b)

- [ ] **Dry run first**

```bash
.venv/bin/python scripts/86b_apply_ghost_remaps.py --dry-run
```

Expected: prints each `ghost_slug → proposed_slug (N rows)` without touching the DB.

- [ ] **Apply remaps**

```bash
.venv/bin/python scripts/86b_apply_ghost_remaps.py
```

Expected: `Applied N remaps, M total contribution rows updated`. Then `COMMIT` message.

---

## Task B3: Manual name alias script (new — script 100)

Ghost slug report catches fuzzy matches. Truncated all-caps names like "DEMOCRATIC NATL COMMITTEE" (stored slug) vs "DEMOCRATIC NATIONAL COMMITTEE" (canonical) won't fuzz-match reliably. This script hard-codes three known broken aliases.

The three known cases from `data_integrity_lessons.md`:
- `democratic-natl-committee` → `democratic-national-committee` ($9.6M)
- `florida-realtors` → `florida-association-of-realtors` ($136M) *(verify slug names against donors table before applying)*
- `las-vegas-sands` → `las-vegas-sands-corp` ($27M) *(same)*

**Files:**
- Create: `scripts/100_apply_name_aliases.py`

- [ ] **Check actual slugs in donors table**

```bash
.venv/bin/python -c "
import os, psycopg2
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path('.env.local'))
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()
cur.execute(\"SELECT slug, name, total_combined FROM donors WHERE name ILIKE '%realt%' OR name ILIKE '%democratic nat%' OR name ILIKE '%sands%' ORDER BY total_combined DESC LIMIT 20\")
for r in cur.fetchall(): print(r)
"
```

Use the output to confirm canonical slugs. Update the ALIASES dict below before creating the script.

- [ ] **Create script 100**

```python
"""
Script 100: Apply manual name aliases for truncated/variant donor slugs.

Handles cases where the fuzzy dedup pipeline (script 09) produced a ghost slug
because the raw name was truncated or spelled differently from the canonical form.
Each alias is manually verified.

Run AFTER script 86b (automated remaps). Run script 85 afterwards to reconcile totals.

Usage:
    .venv/bin/python scripts/100_apply_name_aliases.py
    .venv/bin/python scripts/100_apply_name_aliases.py --dry-run
"""
import os, sys
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
DRY_RUN = "--dry-run" in sys.argv
db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set")

# ── MANUALLY VERIFIED ALIASES ────────────────────────────────────────────────
# Format: (ghost_slug, canonical_slug)
# Verify canonical slugs exist in donors table before adding here.
ALIASES = [
    ("democratic-natl-committee",              "democratic-national-committee"),
    ("florida-realtors",                       "florida-association-of-realtors"),
    ("las-vegas-sands",                        "las-vegas-sands-corp"),
]

conn = psycopg2.connect(db_url)
conn.autocommit = False
cur = conn.cursor()
cur.execute("SET statement_timeout = 0")

print(f"{'[DRY RUN] ' if DRY_RUN else ''}Applying {len(ALIASES)} manual aliases...\n")

total_rows = 0
for ghost, canon in ALIASES:
    # Verify canonical exists
    cur.execute("SELECT 1 FROM donors WHERE slug = %s", (canon,))
    if not cur.fetchone():
        print(f"  SKIP {ghost} → {canon}: canonical slug not found in donors")
        continue
    # Count rows to be updated
    cur.execute("SELECT COUNT(*) FROM contributions WHERE donor_slug = %s", (ghost,))
    n = cur.fetchone()[0]
    print(f"  {ghost:<50} → {canon:<50}  ({n:,} rows)")
    if not DRY_RUN and n > 0:
        cur.execute("UPDATE contributions SET donor_slug = %s WHERE donor_slug = %s", (canon, ghost))
    total_rows += n

if DRY_RUN:
    conn.rollback()
    print(f"\n[DRY RUN] Would update {total_rows:,} contribution rows. No changes made.")
else:
    conn.commit()
    print(f"\nCommitted. {total_rows:,} contribution rows updated.")
    print("Next step: run script 85 to reconcile donor aggregate totals.")
```

- [ ] **Dry run**

```bash
.venv/bin/python scripts/100_apply_name_aliases.py --dry-run
```

Expected: prints each alias row and count. If canonical slug not found, prints SKIP. Fix slugs in ALIASES dict if needed.

- [ ] **Apply**

```bash
.venv/bin/python scripts/100_apply_name_aliases.py
```

- [ ] **Commit**

```bash
git add scripts/100_apply_name_aliases.py
git commit -m "pipeline: manual name alias script for truncated donor slugs (DNC, FL REALTORS, LV Sands)"
```

---

## Task B4: Reconcile donor aggregates (script 85)

After remaps and aliases modify contribution rows, donor aggregate totals are stale. Script 85 recomputes `total_combined`, `total_soft`, `total_hard`, and `num_contributions` from the live contributions table.

- [ ] **Run script 85**

```bash
.venv/bin/python scripts/85_reconcile_donor_aggregates.py
```

Expected: prints rows updated, total delta. Takes several minutes on full table.

---

## Task B5: Run scripts 17 + 25 (FPL lobbying cross-link)

Script 17 exports lobbyists to CSV. Script 25 exports donor profiles JSON and rebuilds the `principal_donation_matches` table which powers the Lobbying tab on donor profiles. After the alias fix, FPL's donor slug will match its principal slug.

- [ ] **Check what script 17 does**

```bash
head -30 scripts/17_export_lobbyists.py
```

- [ ] **Run script 17**

```bash
.venv/bin/python scripts/17_export_lobbyists.py
```

- [ ] **Run script 25**

```bash
.venv/bin/python scripts/25_export_donor_profiles.py 2>&1 | tail -20
```

Expected: rebuilds `principal_donation_matches` table or CSV. Verify FPL appears: navigate to `/donor/florida-power-light-company` → Lobbying tab should now show the principal link.

---

## Task B6: Sunbiz SFTP bulk import (script 97)

Downloads the quarterly FL corporations bulk file via SFTP, parses the 1440-char fixed-width format, loads to `fl_corporations` table, and fuzzy-matches against donors.

- [ ] **Install paramiko if not present**

```bash
.venv/bin/pip install paramiko
```

- [ ] **Run dry run**

```bash
.venv/bin/python scripts/97_import_sunbiz_corporations.py --dry-run
```

Expected: downloads file, parses records, prints match stats, no DB writes.

- [ ] **Run full import**

```bash
.venv/bin/python scripts/97_import_sunbiz_corporations.py
```

Expected: prints rows inserted to `fl_corporations`, donors enriched with `corp_number`, `corp_status`, `corp_match_score`.

---

## Task B7: FL Ethics disclosures (script 98)

Scrapes Form 1 / Form 6 financial disclosures for current legislators via Playwright.

- [ ] **Install dependencies if not present**

```bash
.venv/bin/pip install pdfplumber
.venv/bin/playwright install chromium
```

- [ ] **Test single legislator first**

```bash
.venv/bin/python scripts/98_scrape_ethics_disclosures.py --legislator "Smith, Joseph"
```

Expected: scrapes search results, downloads 1 PDF, caches to `data/raw/ethics/`. Inspect `data/raw/ethics/pdf_text_debug/` for raw text output.

- [ ] **Run full scrape**

```bash
.venv/bin/python scripts/98_scrape_ethics_disclosures.py
```

This is slow (Playwright + 2s request delay per legislator). Expect 15–30 min for all 160 legislators. Cached files are skipped on re-run.

- [ ] **Run load phase only (if scrape was already done)**

```bash
.venv/bin/python scripts/98_scrape_ethics_disclosures.py --load-only
```

---

## Task B8: FL state contracts (scripts 94 + 95)

Script 94 scrapes FACTS (FL contracts database) and produces CSVs. Script 95 loads them into Supabase.

- [ ] **Run script 94**

```bash
.venv/bin/python scripts/94_import_fl_contracts.py
```

Expected: crawls FACTS by vendor prefix, writes `data/processed/fl_contracts.csv` and `data/processed/donor_contract_matches.csv`. Takes 20–60 min. Cache at `data/raw/contracts/facts_cache.json` means re-runs are fast.

- [ ] **Run script 95**

```bash
.venv/bin/python scripts/95_load_contracts_supabase.py
```

Expected: creates `fl_vendor_contracts` + `donor_contract_links` tables, prints rows inserted.

- [ ] **Verify on site**

Navigate to `/donor/florida-power-light-company` → State Contracts tab should now show contract data.

---

## Task B9: Rebuild contributions_deduped.csv (script 09)

70275 (Friends of Ron DeSantis) has 76,479 contribution rows in Supabase, but they aren't in `contributions_deduped.csv` — so donor profiles don't show giving *to* 70275 from the contributions table. Script 09 re-runs the full dedup pipeline.

- [ ] **Check CSV exists and size**

```bash
wc -l "/Users/loganrubenstein/Claude Projects/florida-donor-tracker/data/processed/contributions_deduped.csv" 2>/dev/null || echo "not found"
```

- [ ] **Run script 09 (slow — 30-90 min)**

```bash
.venv/bin/python scripts/09_deduplicate_donors.py
```

Expected: reads `contributions.csv`, clusters names, writes `contributions_deduped.csv` and `donor_dedup_map.csv`. Progress printed per block.

- [ ] **Run script 25 again after 09 completes**

```bash
.venv/bin/python scripts/25_export_donor_profiles.py
```

This rebuilds donor JSON profiles with updated deduped data.

---

## Task C1: Backfill legislator_votes.bill_number (new script 76)

`legislator_votes` has 30,880 rows loaded by script 73. `bill_number` is null for all rows because script 73 only loaded vote records from legislator JSON files which don't include bill_number directly — only `bill_id`. The LegiScan bill JSON files (at `public/data/legislators/*.json` or a separate bills directory) contain `bill_id → bill_number` mappings.

- [ ] **Check what bill data is available**

```bash
ls public/data/legislators/ | head -5
python3 -c "
import json
from pathlib import Path
# Check one legislator JSON for vote structure
f = sorted(Path('public/data/legislators').glob('*.json'))[0]
d = json.loads(f.read_text())
votes = d.get('votes', [])
if votes:
    print('vote keys:', list(votes[0].keys()))
    print('sample:', votes[0])
"
```

- [ ] **Check if separate bill JSON files exist**

```bash
ls public/data/bills/ 2>/dev/null | head -10 || echo "no bills dir"
ls data/raw/ | grep -i bill | head -10 || echo "no raw bill files"
```

- [ ] **Create script 76 based on findings above**

If `bill_number` is available in the legislator JSON vote entries directly (e.g. as `bill_number` or `bill_num`), use this script:

```python
"""
Script 76: Backfill bill_number in legislator_votes from LegiScan JSON.

Reads public/data/legislators/{people_id}.json for each legislator,
extracts bill_number from vote entries, and UPDATEs legislator_votes rows
where bill_number IS NULL and (people_id, roll_call_id) matches.

Usage:
    .venv/bin/python scripts/76_backfill_bill_numbers.py
    .venv/bin/python scripts/76_backfill_bill_numbers.py --dry-run
"""
import json, os, sys
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
DRY_RUN = "--dry-run" in sys.argv

conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
conn.autocommit = False
cur = conn.cursor()
cur.execute("SET statement_timeout = 0")

LEG_DIR = ROOT / "public" / "data" / "legislators"
json_files = [f for f in sorted(LEG_DIR.glob("*.json"))
              if f.name not in ("index.json", "donor_crossref.json")]
print(f"Scanning {len(json_files)} legislator JSON files...")

updates = []  # list of (bill_number, people_id, roll_call_id)
missing_bill_number = 0

for jf in json_files:
    try:
        data = json.loads(jf.read_text())
    except Exception:
        continue
    people_id = data.get("people_id") or int(jf.stem)
    for v in data.get("votes", []):
        bn = v.get("bill_number") or v.get("bill_num") or v.get("number")
        rc = v.get("roll_call_id")
        if bn and rc:
            updates.append((bn, people_id, rc))
        elif rc:
            missing_bill_number += 1

print(f"  Found {len(updates):,} vote entries with bill_number")
print(f"  {missing_bill_number:,} vote entries missing bill_number")

if not updates:
    print("No updates to apply — check vote JSON structure with the diagnostic step above.")
    sys.exit(0)

if DRY_RUN:
    print(f"\n[DRY RUN] Would update up to {len(updates):,} rows.")
    print("Sample:", updates[:3])
    sys.exit(0)

# Batch UPDATE using temp table for speed
cur.execute("""
    CREATE TEMP TABLE bill_number_updates (
        bill_number TEXT,
        people_id   INTEGER,
        roll_call_id INTEGER
    )
""")
execute_values(cur, "INSERT INTO bill_number_updates VALUES %s", updates, page_size=5000)
cur.execute("""
    UPDATE legislator_votes lv
    SET bill_number = u.bill_number
    FROM bill_number_updates u
    WHERE lv.people_id    = u.people_id
      AND lv.roll_call_id = u.roll_call_id
      AND lv.bill_number IS NULL
""")
n = cur.rowcount
conn.commit()
print(f"\nUpdated {n:,} rows in legislator_votes.bill_number")
print("Bill Money Map should now show data for bills with matching legislator votes.")
```

- [ ] **Dry run**

```bash
.venv/bin/python scripts/76_backfill_bill_numbers.py --dry-run
```

If output shows 0 entries with bill_number, the vote JSON structure differs. Re-run the diagnostic step and adjust the field names (`bill_number`, `bill_num`, `number`) in the script.

- [ ] **Apply**

```bash
.venv/bin/python scripts/76_backfill_bill_numbers.py
```

- [ ] **Verify bill money map works**

Navigate to any lobbied bill page (e.g. `/lobbying/bill/hb-5001?year=2018`) → Money Map tab → should show principal donation bars instead of "No legislative vote data."

- [ ] **Commit**

```bash
git add scripts/76_backfill_bill_numbers.py
git commit -m "pipeline: backfill legislator_votes.bill_number from LegiScan JSON"
```

---

## Self-Review

**Spec coverage check:**
- A1 CommitteeConnections all-caps ✅ Task A1
- A2 Transaction Explorer filter grouping ✅ Task A2
- A3 Homepage column order ✅ Task A3
- B1 Script 86 ghost slugs ✅ Task B1
- B2 Script 86b apply remaps ✅ Task B2
- B3 Manual alias table ✅ Task B3 (new script 100)
- B4 Script 85 reconcile after remaps ✅ Task B4
- B5 FPL script 17+25 ✅ Task B5
- B6 Script 97 Sunbiz ✅ Task B6
- B7 Script 98 Ethics ✅ Task B7
- B8 Scripts 94+95 contracts ✅ Task B8
- B9 Script 09 re-run ✅ Task B9
- C1 Bill number backfill ✅ Task C1

**Dependency order verified:**
B3 (alias) → B2 (apply remaps) → B4 (reconcile) → B5 (FPL fix).
B9 (script 09) → B5 (script 25, second run).
All other tasks are independent.
