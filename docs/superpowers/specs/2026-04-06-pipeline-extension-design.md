# Pipeline Extension Design — Expenditures ETL, JSON Export, Donor Deduplication

**Date:** 2026-04-06  
**Project:** Florida Donor Tracker  
**Status:** Approved

---

## Context

Day 1 of the pipeline is complete: contributions are imported, registries (committees, candidates) are downloaded and processed. The FL DOE CGI server is temporarily down, blocking scripts 03/04 (per-committee scraping). This spec covers three scripts that extend the pipeline with what we *can* build now, independent of the server.

The three scripts follow Option 1: independent scripts composable through the existing orchestrator (`06_orchestrate.py`).

---

## Script 07 — Expenditures ETL (`07_import_expenditures.py`)

**Pattern:** Mirrors `01_import_finance.py` exactly.

**Input:** `data/raw/expenditures/Expend_*.txt` (tab-delimited, latin-1 encoding)

**Output:** `data/processed/expenditures.csv`

**Key decisions:**
- Auto-detects column names from the actual files rather than hard-coding them, since no expenditure files exist yet (server down). This ensures the script works correctly when downloads eventually arrive.
- Uses the same `parse_amount()` logic as script 01 (handles `$`, commas, parentheses-as-negative).
- Falls back with a clear message if `data/raw/expenditures/` is empty — exits 0 (not an error) since this is expected while the server is down.
- Adds `source_file` column to every row for traceability.
- Prints summary: total rows, total $, date range, top 10 vendors by row count.

**Column rename strategy:** On first run, prints the raw column names found so they can be mapped. A `COLUMN_RENAME` dict will be populated after seeing a real expenditure file. Until then, columns pass through as-is with whitespace stripped.

---

## Script 08 — JSON Export (`08_export_json.py`)

**Inputs:** `data/processed/contributions_deduped.csv`, `data/processed/committees.csv`, `data/processed/candidates.csv`, `data/processed/expenditures.csv` (optional — skipped if missing)

**Outputs** (all written to `public/data/`):

| File | Contents | Size estimate |
|---|---|---|
| `top_donors.json` | Top 100 donors by lifetime $ (deduplicated) | <50 KB |
| `top_corporate_donors.json` | Top 100 corporate donors (keyword-filtered) | <50 KB |
| `donor_flows.json` | Top 500 donor→committee pairs by total $ | <100 KB |
| `committees/{acct_num}.json` | Per-committee: top 25 donors + total received | ~1 KB each |
| `meta.json` | Generated timestamp, row counts, date range | <1 KB |

**Corporate detection keywords:** INC, LLC, CORP, CO., COMPANY, ASSOCIATION, FOUNDATION, PAC, FUND, TRUST, GROUP (matched case-insensitively against `canonical_name`)

**Deriving committee from source file:** `contributions.csv` has no recipient column — each contribution file covers one committee and the acct_num is embedded in the filename (`Contrib_{acct_num}.txt`). Script 08 parses `source_file` → extracts acct_num → joins to `committees.csv` to get `committee_name`. Rows from the manually-downloaded `Contrib_2024_rpof.txt` are matched to RPOF (acct 4700) by recognizing the `rpof` suffix.

**`donor_flows.json` structure:**
```json
[
  {
    "donor": "TECO ENERGY, INC.",
    "committee": "Republican Party of Florida",
    "committee_acct": "4700",
    "total_amount": 125000.00,
    "num_contributions": 12
  },
  ...
]
```

**`top_donors.json` structure:**
```json
[
  {
    "name": "TECO ENERGY, INC.",
    "total_amount": 930000.00,
    "num_contributions": 374,
    "is_corporate": true
  },
  ...
]
```

**Per-committee file structure** (`committees/4700.json`):
```json
{
  "acct_num": "4700",
  "committee_name": "Republican Party of Florida",
  "total_received": 930646176.28,
  "num_contributions": 166890,
  "top_donors": [
    {"name": "TECO ENERGY, INC.", "total_amount": 125000.00, "num_contributions": 12},
    ...
  ]
}
```

**Behavior:**
- Skips any input file that doesn't exist (safe to run before all data is collected)
- Prints a summary of files written and their sizes
- Monetary values: rounded to 2 decimal places
- `--force` flag re-generates all files even if they exist

---

## Script 09 — Donor Deduplication (`09_deduplicate_donors.py`)

**Input:** `data/processed/contributions.csv`

**Outputs:**
- `data/processed/contributions_deduped.csv` — original file + `canonical_name` column
- `data/processed/donor_dedup_map.csv` — two columns: `raw_name`, `canonical_name`

**Algorithm:**

1. Extract unique contributor names with total $ and count from `contributions.csv`
2. Clean names for comparison: uppercase, strip punctuation, collapse whitespace
3. **Block by first 3 characters** of cleaned name — only compare within blocks (reduces O(n²) to manageable)
4. Within each block: `thefuzz.fuzz.token_sort_ratio` at ≥75% threshold
   - `token_sort_ratio` chosen because it handles word-order variants ("JOHN SMITH CORP" vs "CORP JOHN SMITH")
5. **Union-Find** to cluster all transitively-matched names
6. **Canonical name selection:** the spelling with the highest total $ in the cluster (most financially active = most consistently named)
7. Write outputs

**Summary printed:**
- Unique names before dedup
- Unique canonical names after
- Number of clusters with >1 variant
- Top 10 largest clusters (shows what got merged)

**Performance note:** With ~166k contributions, the unique name count is likely 20k–50k. Blocking keeps per-block comparisons small. `python-levenshtein` (already installed) makes `thefuzz` ~10x faster. Expected runtime: under 2 minutes.

---

## Execution Order

Scripts are independent but should run in this order:

```
09_deduplicate_donors.py   (reads contributions.csv → writes contributions_deduped.csv)
08_export_json.py          (reads contributions_deduped.csv → writes public/data/)
07_import_expenditures.py  (reads Expend_*.txt → writes expenditures.csv; safe to run anytime)
```

`06_orchestrate.py` will be updated to append these three steps after the existing pipeline.

---

## Files Created

```
scripts/07_import_expenditures.py
scripts/08_export_json.py
scripts/09_deduplicate_donors.py
docs/superpowers/specs/2026-04-06-pipeline-extension-design.md  (this file)
```

## Files Modified

```
scripts/06_orchestrate.py   — add steps 09 → 07 → 08 to STEPS list
```
