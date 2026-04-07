# Committee Profile Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build static committee profile pages at `/committee/[acct_num]` showing top donors, stats, and research links — generated from existing per-committee JSON files.

**Architecture:** Enrich the Python export script to produce richer per-committee JSON (top 100 donors, date range, donor type), then build a Next.js static route with `generateStaticParams` that reads those JSON files at build time. One server-only lib module for JSON loading; one pure server component for the UI.

**Tech Stack:** Next.js 14 App Router (server components, generateStaticParams, force-static), Node.js `fs` module, Python/pandas for data enrichment.

---

### Task 1: Enrich per-committee JSON export

**Files:**
- Modify: `scripts/08_export_json.py` — `build_per_committee_files()` function (lines 164–205)

- [ ] **Step 1: Update `build_per_committee_files` to top 100, add date_range, add type per donor**

Replace lines 164–205 with:

```python
def build_per_committee_files(
    df: pd.DataFrame,
    committees_df: pd.DataFrame,
) -> dict:
    """
    Build one summary dict per committee.

    Returns {acct_num: {acct_num, committee_name, total_received,
                        num_contributions, date_range, top_donors}}
    """
    work = df.copy()
    work["committee_acct"] = work["source_file"].apply(derive_committee_acct)
    work = work[work["committee_acct"].notna()]

    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()

    results = {}
    for acct, group in work.groupby("committee_acct"):
        top_donors_grouped = (
            group.groupby("canonical_name")["amount"]
            .agg(total_amount="sum", num_contributions="count")
            .reset_index()
            .rename(columns={"canonical_name": "name"})
            .sort_values("total_amount", ascending=False)
            .head(100)
        )
        top_donors = [
            {
                "name": row["name"],
                "total_amount": round(float(row["total_amount"]), 2),
                "num_contributions": int(row["num_contributions"]),
                "type": build_donor_type(row["name"], committees_df),
            }
            for _, row in top_donors_grouped.iterrows()
        ]

        # Date range from contribution_date column (if present)
        if "contribution_date" in group.columns:
            dates = group["contribution_date"].dropna()
            date_range = {
                "earliest": str(dates.min()) if len(dates) else None,
                "latest":   str(dates.max()) if len(dates) else None,
            }
        else:
            date_range = {"earliest": None, "latest": None}

        results[acct] = {
            "acct_num": acct,
            "committee_name": acct_to_name.get(acct, "Unknown"),
            "total_received": round(float(group["amount"].sum()), 2),
            "num_contributions": int(len(group)),
            "date_range": date_range,
            "top_donors": top_donors,
        }
    return results
```

- [ ] **Step 2: Re-run the export script to regenerate all committee JSON files**

```bash
cd ~/Claude\ Projects/florida-donor-tracker
source .venv/bin/activate  # or however you activate
python scripts/08_export_json.py
```

Expected output: `112 committee files → public/data/committees/`

- [ ] **Step 3: Spot-check one committee JSON**

```bash
python -c "
import json; d = json.load(open('public/data/committees/4700.json'))
print(d['committee_name'])
print(d['date_range'])
print(d['top_donors'][0])
print(len(d['top_donors']), 'donors')
"
```

Expected: committee name, date_range dict with non-null values, first donor has `type` field, 100 (or fewer if the committee has fewer) donors listed.

---

### Task 2: Create `lib/loadCommittee.js`

**Files:**
- Create: `lib/loadCommittee.js`

- [ ] **Step 1: Write the module**

```js
// lib/loadCommittee.js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMMITTEES_DIR = join(process.cwd(), 'public', 'data', 'committees');

export function loadCommittee(acctNum) {
  const file = join(COMMITTEES_DIR, `${acctNum}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function listCommitteeAcctNums() {
  return readdirSync(COMMITTEES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
```

- [ ] **Step 2: Verify it exists at the right path**

```bash
ls "lib/loadCommittee.js"
```

Expected: file listed.

---

### Task 3: Create the committee page route

**Files:**
- Create: `app/committee/[acct_num]/page.js`

- [ ] **Step 1: Write the page**

```js
// app/committee/[acct_num]/page.js
import { loadCommittee, listCommitteeAcctNums } from '@/lib/loadCommittee';
import CommitteeProfile from '@/components/committee/CommitteeProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listCommitteeAcctNums().map(acct_num => ({ acct_num }));
}

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  const data = loadCommittee(acct_num);
  return { title: `${data.committee_name} | FL Donor Tracker` };
}

export default async function CommitteePage({ params }) {
  const { acct_num } = await params;
  const data = loadCommittee(acct_num);
  return <CommitteeProfile data={data} />;
}
```

---

### Task 4: Create `CommitteeProfile` server component

**Files:**
- Create: `components/committee/CommitteeProfile.js`

- [ ] **Step 1: Write the component**

```js
// components/committee/CommitteeProfile.js

const PARTY_OVERRIDES = {
  'c_4700': 'R', 'c_80335': 'R',
  'd_FRIENDS_OF_RON_DESANTIS': 'R', 'd_REPUBLICAN_NATIONAL_COMMITTEE': 'R',
  'c_61265': 'D', 'c_61018': 'D',
};
const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];

function getParty(name, acct) {
  const key = `c_${acct}`;
  if (PARTY_OVERRIDES[key]) return PARTY_OVERRIDES[key];
  const u = (name || '').toUpperCase();
  if (R_KW.some(k => u.includes(k))) return 'R';
  if (D_KW.some(k => u.includes(k))) return 'D';
  return null;
}

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(s) {
  if (!s || s === 'None' || s === 'null') return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const TYPE_COLOR = { committee: 'var(--teal)', corporate: '#94a3b8', individual: 'var(--blue)' };

export default function CommitteeProfile({ data }) {
  const party = getParty(data.committee_name, data.acct_num);
  const partyColor = party === 'R' ? 'var(--republican)' : party === 'D' ? 'var(--democrat)' : null;

  const researchLinks = [
    {
      label: 'FL Elections Records →',
      href: 'https://dos.fl.gov/elections/campaign-finance/reports-data/',
    },
    {
      label: 'Google News →',
      href: `https://news.google.com/search?q=${encodeURIComponent(data.committee_name + ' Florida politics')}`,
    },
    {
      label: 'OpenSecrets →',
      href: `https://www.opensecrets.org/search?q=${encodeURIComponent(data.committee_name)}&type=donors`,
    },
  ];

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      {/* Back link */}
      <a href="/network" style={{
        fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none',
        display: 'inline-block', marginBottom: '1.5rem',
        fontFamily: 'var(--font-mono)',
      }}>
        ← network
      </a>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            committee
          </span>
          {party && (
            <span style={{
              fontSize: '0.65rem', padding: '0.15rem 0.45rem',
              border: `1px solid ${partyColor}`, color: partyColor,
              borderRadius: '3px', letterSpacing: '0.06em', fontWeight: 'bold',
            }}>
              {party}
            </span>
          )}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '0.4rem',
        }}>
          {data.committee_name}
        </h1>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          Acct #{data.acct_num}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Total Received',   value: fmt(data.total_received)              },
          { label: 'Contributions',    value: data.num_contributions.toLocaleString() },
          { label: 'Earliest',         value: fmtDate(data.date_range?.earliest)    },
          { label: 'Latest',           value: fmtDate(data.date_range?.latest)      },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Top donors table */}
      {data.top_donors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.75rem',
          }}>
            Top Donors
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Donor', 'Type', 'Total Given', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem', textAlign: h === '#' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_donors.map((donor, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                    {donor.name}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: TYPE_COLOR[donor.type] || 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {donor.type}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                    {fmt(donor.total_amount)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                    {donor.num_contributions.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Research links */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          Research
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {researchLinks.map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
```

---

### Task 5: Activate "browse committees" card on home page

**Files:**
- Modify: `app/page.js` — lines 248–266 (the third tool card div)

- [ ] **Step 1: Replace the greyed-out static div with a working link**

Replace:
```js
          <div style={{
            border: '1px solid rgba(128,255,160,0.1)',
            borderRadius: '3px',
            padding: '1.25rem',
            background: 'rgba(128,255,160,0.01)',
            opacity: 0.5,
            cursor: 'default',
          }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
              → browse committees
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
              Individual committee pages — top donors, total received, full history.
            </div>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-dim)', marginTop: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              coming soon
            </div>
          </div>
```

With:
```js
          <a href="/committee/4700" style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid rgba(128,255,160,0.2)',
              borderRadius: '3px',
              padding: '1.25rem',
              background: 'rgba(128,255,160,0.02)',
              height: '100%',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                → browse committees
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
                Individual committee pages — top donors, total received, full history.
              </div>
            </div>
          </a>
```

---

## Verification Checklist

- [ ] `public/data/committees/4700.json` has `date_range`, `top_donors[0].type`, and up to 100 donors
- [ ] `http://localhost:3000/committee/4700` loads without error — shows committee name, stats, donor table
- [ ] Party badge shows `R` in red for `acct_num=4700` (RPOF)
- [ ] Party badge shows `D` in blue for `acct_num=61265` (AFSCME)
- [ ] Research links open in new tab
- [ ] Home page "browse committees" card is clickable and goes to `/committee/4700`
- [ ] `← network` link goes back to `/network`
