# Candidate → Soft-Money Linkage: Architecture & Methodology

This document explains how the Florida Donor Tracker links candidate accounts to political committees (PACs, ECOs, CCEs, etc.) and what rules determine whether a link is shown publicly.

---

## Background

Florida candidates raise "hard money" directly into their campaign accounts. "Soft money" refers to funds raised by separate political entities — political action committees, electioneering communications organizations, and 527/501(c)(4) groups — that operate independently but are often closely associated with a specific candidate.

The question of *how* to link these entities is legally and analytically complex. Sharing a treasurer, having a similar name, or being located at the same address does not, by itself, prove that a committee is controlled by or attributable to a candidate. This pipeline is designed to surface only the strongest evidence while storing weaker signals internally for research purposes.

---

## Edge Types

Every link between a candidate and a committee is stored as one or more typed "edges" in the `candidate_pc_edges` table. Each edge carries full provenance.

### Publishable edges (shown on the site)

| Edge Type | What it means | Source |
|-----------|--------------|--------|
| `SOLICITATION_CONTROL` | The candidate filed a DS-DE 102 Statement of Solicitation tying them to the committee/organization | FL DoE Public Solicitations portal; parsed XLS download |
| `STATEMENT_OF_ORG_SUPPORT` | The committee's Statement of Organization explicitly names this candidate as the supported candidate | Campaign docs PDFs *(Phase 2 — not yet scraped)* |
| `DIRECT_CONTRIBUTION_TO_CANDIDATE` | The committee made a monetary contribution (CAN-type expenditure) directly to this candidate's campaign account | `data/processed/expenditures.csv` type_code=CAN |
| `OTHER_DISTRIBUTION_TO_CANDIDATE` | The committee distributed goods, services, or other indirect support to the candidate (DIS-type expenditure) | `data/processed/expenditures.csv` type_code=DIS |
| `IEC_FOR_OR_AGAINST` | The committee made an independent expenditure naming this candidate | `data/processed/expenditures.csv` type_code=IEC/IEI |
| `ECC_FOR_OR_AGAINST` | The committee made an electioneering communication naming this candidate | `data/processed/expenditures.csv` type_code=ECC/ECI |

### Internal-only edge (not shown on the site)

| Edge Type | What it means |
|-----------|--------------|
| `ADMIN_OVERLAP_ONLY` | Shared treasurer, shared chair, shared phone, shared address, or committee name contains candidate name. **Never sufficient alone to create a public link.** |

---

## Publication Rule

**A candidate → committee link is shown on the site only if at least one publishable edge exists for that (candidate, committee) pair.**

Administrative overlaps are stored in `candidate_pc_edges` with `is_publishable = false` and are available for internal research and audit but are never displayed to site visitors.

### What this means in practice

- A committee named "Friends of Candidate X" where Candidate X is NOT the chair, but HAS filed a DS-DE 102 → **public link** via `SOLICITATION_CONTROL`
- A committee where Candidate X is the treasurer → **no public link** unless a solicitation, contribution, or expenditure also exists
- A committee that contributed $50,000 directly to Candidate X's campaign → **public link** via `DIRECT_CONTRIBUTION_TO_CANDIDATE`
- A committee that ran TV ads targeting Candidate X → **public link** via `IEC_FOR_OR_AGAINST` or `ECC_FOR_OR_AGAINST`

---

## False-Positive Suppression

Two filters reduce noise in the `ADMIN_OVERLAP_ONLY` pass:

**Professional treasurer filter**: Any person serving as treasurer for 5 or more committees is flagged as a likely professional treasurer (a paid service provider, not a personal associate of the candidate). These edges are still stored but tagged `match_method = 'professional_treasurer'`.

**Common surname filter**: If a surname is shared by 10 or more candidates and the fuzzy match score is below 95, the admin-overlap edge is suppressed entirely. This prevents "Rodriguez" or "Smith" treasurer matches from creating spurious links.

---

## Candidate-Specific Attribution (`is_candidate_specific`)

The `is_candidate_specific` flag determines whether a PAC's total fundraising (`total_received`) is counted toward a candidate's `soft_money_total`. Only PACs with verifiable evidence of candidate control are attributed. Spending patterns alone (which candidates a PAC gave money to) indicate *support*, not *control*, and do not qualify.

### Attribution standard

A journalist asking "why do you say this PAC belongs to Candidate X?" should get one of two answers:

1. **"The candidate filed a Statement of Solicitation (DS-DE 102) declaring the relationship."** — Public record at `doesecure.dos.state.fl.us/PublicSolicitations/`.
2. **"The PAC is named after the candidate."** — Verifiable from the committee registry.

### How it works

**For SOLICITATION_CONTROL edges** (DS-DE 102 filings):
- `is_candidate_specific = True` if:
  - (a) The candidate's last name (≥5 chars) appears as a whole word in the PAC name (`name_in_pac`), OR
  - (b) The candidate is the only person who ever filed a solicitation for this PAC (`sole_filer`, counted by `pc_acct_num` from the edges themselves to survive committee renames)

**For all other edge types** (DIRECT_CONTRIBUTION, IEC, ECC, etc.):
- `is_candidate_specific = True` if:
  - (a) The same (candidate, PAC) pair also has a specific SOLICITATION_CONTROL edge (crossover), OR
  - (b) The candidate's last name (≥5 chars) is in the PAC name AND the edge direction is not "opposition"

### What this means in practice

| Scenario | Specific? | Reasoning |
|----------|-----------|-----------|
| DeSantis → "Friends of Ron DeSantis" | Yes | Name in PAC + solicitation |
| Simpson → "Florida Green PAC" | Yes | Sole solicitation filer |
| Nunez → "Friends of Ron DeSantis" | No | Name not in PAC, 2 filers (DeSantis + Nunez) |
| Ingoglia → "Empower Parents PAC" (acct 70275) | No | Name not in PAC, 2+ filers |
| "Watchdog PAC" (5 filers) → any candidate | No | Multi-filer, no name match |
| Random industry PAC gave to one candidate | No | Contribution ≠ control |
| "Friends of Candidate X" PAC gave to X (no solicitation) | Yes | Name in PAC |

### Why "only gave to one candidate" is not sufficient

A PAC that gave money to exactly one candidate is not necessarily controlled by that candidate. The Florida Realtors PAC might focus on a single race; a small business PAC might make one strategic donation. Attributing their entire fundraising total to a candidate based on one contribution is not defensible. Control is established through legal filings (DS-DE 102), not spending patterns.

---

## Committee Lineage (Predecessor/Successor Groups)

Some candidates have PACs that disbanded and re-registered under a new account number. The `committee_lineage` table groups these accounts so soft-money totals can include predecessor committee fundraising.

**Grouping algorithm**: For each candidate with 2+ linked committees, each pair is scored on:
1. Committee name similarity ≥ 85% (token_sort_ratio)
2. Shared officer (chair or treasurer name match ≥ 88%)
3. Account number gap ≤ 20,000 (FL DoE assigns acct_nums sequentially — a small gap suggests same era)

**Requirement**: Score ≥ 2 of 3 signals, AND both committees must be linked to the same candidate.

The `committee_lineage.role` field identifies each account as `predecessor`, `successor`, or `current`.

---

## Byron Donalds Walkthrough

This is the motivating example for the stricter evidence model.

**Accounts involved:**
- Candidate: Byron Donalds, acct 89042
- Current PAC: Friends of Byron Donalds, acct 89043
- Predecessor PAC: Byron Donalds for Florida, acct 74495

**What the old linker (script 58) did wrong:**
Script 58 matched the *chair* of PAC 89043 (Ryan Smith) to any candidate named Ryan Smith, and linked Byron Donalds via chair match because the committee *name* contained "Byron Donalds". The chair field is not Donalds — it's Ryan Smith. The old linker conflated "candidate-named committee" with "candidate as officer."

**What the new linker (script 71) does:**
1. **Pass 6 (ADMIN_OVERLAP_ONLY)**: PAC 89043 has "BYRON DONALDS" in the committee name → admin overlap edge for candidate 89042. `is_publishable = false`. Ryan Smith (if he is a candidate) gets an admin overlap edge for being chair. `is_publishable = false`.
2. **Pass 1 (SOLICITATION_CONTROL)**: Byron Donalds has a DS-DE 102 filing for "Friends of Byron Donalds" → `SOLICITATION_CONTROL` edge for candidate 89042 to PAC 89043. `is_publishable = true`.
3. **Script 72 (Lineage)**: PACs 89043 and 74495 share similar names, same candidate linkage, and a plausible account gap → grouped as lineage. Soft money totals for Donalds include both PACs.

**What gets displayed**: One public link showing "Solicitation" with the filing date as evidence. No link is shown based on shared name, phone, or address alone.

---

## Audit Trail

Every edge in `candidate_pc_edges` carries:

| Column | Example |
|--------|---------|
| `edge_type` | `SOLICITATION_CONTROL` |
| `source_type` | `solicitation_index` |
| `source_record_id` | `500` (solicitation ID from index.json) |
| `match_method` | `fuzzy_name` |
| `match_score` | `96.0` |
| `evidence_summary` | `Statement of solicitation filed for Friends of Byron Donalds (2021-03-05)` |
| `is_publishable` | `true` |

To audit any specific link:
```sql
SELECT edge_type, evidence_summary, source_type, source_record_id, match_method, match_score
FROM candidate_pc_edges
WHERE candidate_acct_num = '89042' AND pc_acct_num = '89043'
ORDER BY is_publishable DESC, edge_type;
```

---

## Pipeline Execution

Run these scripts in order after each quarterly data update:

```bash
# 1. Build edges (replaces script 58)
.venv/bin/python scripts/71_build_linkage_edges.py

# 2. Build committee lineage (replaces script 61 predecessor logic)
.venv/bin/python scripts/72_build_committee_lineage.py

# 3. Load to Supabase (replaces scripts 59 + 63)
.venv/bin/python scripts/73_load_linkage_edges_supabase.py

# 4. Recompute soft money totals (replaces script 61)
.venv/bin/python scripts/74_update_soft_money_totals.py
```

**Estimated runtime**: scripts 71+72 take ~5-10 minutes on the full dataset. Scripts 73+74 take ~1 minute each.

---

## Data Sources

| Source | File | What it feeds |
|--------|------|--------------|
| Candidates registry | `data/processed/candidates.csv` | All passes |
| Committees registry | `data/processed/committees.csv` | All passes |
| Solicitations (XLS parse) | `public/data/solicitations/index.json` | Pass 1A |
| Solicitations (HTML scrape) | `data/raw/solicitations/solicitations.csv` | Pass 1B |
| Expenditures (CAN type) | `data/processed/expenditures.csv` | Pass 2 |
| Expenditures (DIS type) | `data/processed/expenditures.csv` | Pass 3 |
| Expenditures (IEC/IEI type) | `data/processed/expenditures.csv` | Pass 4 |
| Expenditures (ECC/ECI type) | `data/processed/expenditures.csv` | Pass 5 |
| Registry overlap | `candidates.csv` + `committees.csv` | Pass 6 (internal only) |

---

## Phase 2 (Future)

The following evidence type is not yet collected because it requires crawling campaign documents pages (ASP.NET __doPostBack forms) and parsing PDFs:

- **`STATEMENT_OF_ORG_SUPPORT`**: The Statement of Organization (filed when a committee registers) names the candidate it supports. This would be the highest-confidence link type. Requires: `pip install pdfplumber`, a campaign-docs page crawler, and a PDF parser for Statement of Organization forms.

When Phase 2 is implemented, add a new script (e.g., `75_scrape_campaign_docs.py`) that downloads PDFs into `data/raw/campaign_docs/{acct_num}/` and emits `STATEMENT_OF_ORG_SUPPORT` edges which are then re-ingested by script 73.
