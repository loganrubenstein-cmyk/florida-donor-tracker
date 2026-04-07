# Pipeline Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three pipeline scripts — donor deduplication, expenditures ETL, and JSON export — that extend the existing FL campaign finance pipeline without requiring the FL DOE CGI server to be up.

**Architecture:** Three independent scripts following existing patterns in `01_import_finance.py` and `config.py`. Script 09 (dedup) runs first and produces `contributions_deduped.csv`; script 08 (JSON export) reads from it. Script 07 (expenditures ETL) is fully standalone. All three are added as steps in `06_orchestrate.py`.

**Tech Stack:** Python 3.14, pandas, thefuzz + python-levenshtein (fuzzy matching), pathlib, json, pytest

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `tests/conftest.py` | Shared pytest fixtures (sample DataFrames, tmp paths) |
| Create | `tests/test_09_deduplicate.py` | Tests for dedup helpers |
| Create | `scripts/09_deduplicate_donors.py` | Donor deduplication pipeline |
| Create | `tests/test_07_expenditures.py` | Tests for expenditures ETL helpers |
| Create | `scripts/07_import_expenditures.py` | Expenditures ETL |
| Create | `tests/test_08_export_json.py` | Tests for JSON export helpers |
| Create | `scripts/08_export_json.py` | JSON export pipeline |
| Modify | `scripts/requirements.txt` | Add pytest |
| Modify | `scripts/06_orchestrate.py` | Add steps 09 → 07 → 08 |

---

## Task 1: Add pytest and create test scaffold

**Files:**
- Modify: `scripts/requirements.txt`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Add pytest to requirements.txt**

Open `scripts/requirements.txt` and add at the bottom:
```
pytest>=8.0.0
```

- [ ] **Step 2: Install pytest**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pip install -r scripts/requirements.txt -q
python -m pytest --version
```

Expected output: `pytest 8.x.x`

- [ ] **Step 3: Create `tests/__init__.py`**

Create an empty file at `tests/__init__.py` (makes `tests/` a Python package).

- [ ] **Step 4: Create `tests/conftest.py`**

```python
# tests/conftest.py
"""Shared fixtures for all pipeline tests."""
import pandas as pd
import pytest
from pathlib import Path


@pytest.fixture
def sample_contributions_df():
    """Minimal contributions DataFrame matching contributions.csv schema."""
    return pd.DataFrame({
        "report_year": ["2024", "2024", "2024", "2024"],
        "contribution_date": ["2024-01-15", "2024-02-01", "2024-01-20", "2024-03-01"],
        "amount": [5000.0, 2500.0, 5000.0, 1000.0],
        "contributor_name": [
            "TECO ENERGY, INC.",
            "TECO ENERGY INC",          # duplicate variant
            "U.S. SUGAR CORPORATION",
            "JOHN SMITH",
        ],
        "contributor_address": ["123 Main St", "123 Main St", "456 Oak Ave", "789 Elm St"],
        "contributor_city_state_zip": ["TAMPA, FL 33601", "TAMPA, FL 33601", "CLEWISTON, FL 33440", "MIAMI, FL 33101"],
        "contributor_occupation": ["ENERGY", "ENERGY", "AGRICULTURE", "RETIRED"],
        "type_code": ["CHE", "CHE", "CHE", "CHE"],
        "in_kind_description": ["", "", "", ""],
        "source_file": [
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
        ],
    })


@pytest.fixture
def sample_committees_df():
    """Minimal committees DataFrame matching committees.csv schema."""
    return pd.DataFrame({
        "acct_num": ["4700", "55417", "74932"],
        "committee_name": [
            "Republican Party of Florida",
            "Accountability Watchdog, ECO",
            "Accountability in Government",
        ],
        "type_code": ["PTY", "ECO", "PAC"],
        "type_desc": ["Party Executive Committee", "Electioneering Communications Organization", "Political Committee"],
        "city": ["Tallahassee", "Miami", "Orlando"],
        "state": ["FL", "FL", "FL"],
    })


@pytest.fixture
def tmp_data_dir(tmp_path):
    """A temporary directory mimicking the project's data/processed/ layout."""
    (tmp_path / "processed").mkdir()
    (tmp_path / "raw" / "expenditures").mkdir(parents=True)
    (tmp_path / "public" / "data" / "committees").mkdir(parents=True)
    return tmp_path
```

- [ ] **Step 5: Verify pytest finds conftest**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/ --collect-only 2>&1 | head -10
```

Expected: `no tests ran` (no tests yet, but no errors either)

- [ ] **Step 6: Commit**

```bash
git add scripts/requirements.txt tests/__init__.py tests/conftest.py
git commit -m "test: add pytest and shared test fixtures"
```

---

## Task 2: Donor deduplication — helpers (TDD)

**Files:**
- Create: `tests/test_09_deduplicate.py`
- Create: `scripts/09_deduplicate_donors.py` (helpers only, no `main()` yet)

- [ ] **Step 1: Write failing tests for `clean_name`, `get_blocks`, `UnionFind`**

Create `tests/test_09_deduplicate.py`:

```python
# tests/test_09_deduplicate.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from deduplicate_09 import clean_name, get_blocks, UnionFind


def test_clean_name_uppercases():
    assert clean_name("teco energy, inc.") == "TECO ENERGY INC"

def test_clean_name_strips_punctuation():
    assert clean_name("U.S. Sugar Corp.") == "US SUGAR CORP"

def test_clean_name_collapses_whitespace():
    assert clean_name("  John   Smith  ") == "JOHN SMITH"

def test_get_blocks_groups_by_first_three():
    blocks = get_blocks({"TECO ENERGY INC": "TEC", "TECO POWER LLC": "TEC", "JOHN SMITH": "JOH"})
    assert set(blocks["TEC"]) == {"TECO ENERGY INC", "TECO POWER LLC"}
    assert blocks["JOH"] == ["JOHN SMITH"]

def test_get_blocks_short_name_uses_full():
    blocks = get_blocks({"AB": "AB"})
    assert "AB" in blocks

def test_union_find_single_item():
    uf = UnionFind(["A"])
    assert uf.find("A") == "A"

def test_union_find_merges():
    uf = UnionFind(["A", "B", "C"])
    uf.union("A", "B")
    assert uf.find("A") == uf.find("B")
    assert uf.find("C") != uf.find("A")

def test_union_find_clusters():
    uf = UnionFind(["A", "B", "C"])
    uf.union("A", "B")
    clusters = uf.clusters()
    assert len(clusters) == 2
    ab_cluster = next(c for c in clusters if "A" in c)
    assert set(ab_cluster) == {"A", "B"}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_09_deduplicate.py -v 2>&1 | tail -5
```

Expected: `ERROR` — `ModuleNotFoundError: No module named 'deduplicate_09'`

- [ ] **Step 3: Create `scripts/09_deduplicate_donors.py` with helpers**

```python
# scripts/09_deduplicate_donors.py
"""
Script 09: Deduplicate contributor names using fuzzy string matching.

Reads contributions.csv, clusters similar contributor names, picks a canonical
spelling per cluster, and writes contributions_deduped.csv + donor_dedup_map.csv.

Usage (from project root, with .venv activated):
    python scripts/09_deduplicate_donors.py
    python scripts/09_deduplicate_donors.py --force
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd
from thefuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

SIMILARITY_THRESHOLD = 75  # token_sort_ratio score (0–100) to consider a match

# Output paths
DEDUPED_CSV   = PROCESSED_DIR / "contributions_deduped.csv"
DEDUP_MAP_CSV = PROCESSED_DIR / "donor_dedup_map.csv"

_PUNCT_RE = re.compile(r"[^A-Z0-9\s]")


def clean_name(name: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace for comparison."""
    upper = str(name).upper()
    no_punct = _PUNCT_RE.sub("", upper)
    return " ".join(no_punct.split())


def get_blocks(cleaned_to_key: dict[str, str]) -> dict[str, list[str]]:
    """
    Group raw names by the first 3 characters of their cleaned form.
    cleaned_to_key maps raw_name -> cleaned_name.
    Returns dict: block_key -> [raw_name, ...]
    """
    blocks: dict[str, list[str]] = {}
    for raw, cleaned in cleaned_to_key.items():
        key = cleaned[:3] if len(cleaned) >= 3 else cleaned
        blocks.setdefault(key, []).append(raw)
    return blocks


class UnionFind:
    """Disjoint-set data structure for clustering matched names."""

    def __init__(self, items: list[str]):
        self.parent = {item: item for item in items}

    def find(self, item: str) -> str:
        if self.parent[item] != item:
            self.parent[item] = self.find(self.parent[item])
        return self.parent[item]

    def union(self, a: str, b: str) -> None:
        self.parent[self.find(a)] = self.find(b)

    def clusters(self) -> list[list[str]]:
        groups: dict[str, list[str]] = {}
        for item in self.parent:
            root = self.find(item)
            groups.setdefault(root, []).append(item)
        return list(groups.values())


def build_clusters(
    name_stats: dict[str, dict],
    threshold: int = SIMILARITY_THRESHOLD,
) -> list[list[str]]:
    """
    Find clusters of similar contributor names.

    name_stats: {raw_name: {"total": float, "count": int, "cleaned": str}}
    Returns list of clusters (each cluster is a list of raw names).
    """
    all_names = list(name_stats.keys())
    cleaned_map = {n: name_stats[n]["cleaned"] for n in all_names}
    blocks = get_blocks(cleaned_map)

    uf = UnionFind(all_names)

    for block_names in blocks.values():
        if len(block_names) < 2:
            continue
        for i in range(len(block_names)):
            for j in range(i + 1, len(block_names)):
                a, b = block_names[i], block_names[j]
                score = fuzz.token_sort_ratio(
                    name_stats[a]["cleaned"],
                    name_stats[b]["cleaned"],
                )
                if score >= threshold:
                    uf.union(a, b)

    return uf.clusters()


def pick_canonical(cluster: list[str], name_stats: dict[str, dict]) -> str:
    """
    Pick the canonical name for a cluster.
    Chooses the spelling with the highest total $ donated
    (most financially active donors tend to have the most consistent names).
    """
    return max(cluster, key=lambda n: name_stats[n]["total"])


def main(force: bool = False) -> int:
    print("=== Script 09: Deduplicate Donors ===\n")

    contributions_csv = PROCESSED_DIR / "contributions.csv"
    if not contributions_csv.exists():
        print(f"ERROR: {contributions_csv} not found. Run 01_import_finance.py first.", file=sys.stderr)
        return 1

    if DEDUPED_CSV.exists() and not force:
        print(f"Skipped — {DEDUPED_CSV.name} already exists (use --force to redo)")
        return 0

    print(f"Loading {contributions_csv.name} ...", flush=True)
    df = pd.read_csv(contributions_csv, dtype=str, low_memory=False)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    # Build per-name stats
    print("Building name statistics ...", flush=True)
    name_groups = df.groupby("contributor_name")["amount"]
    name_stats: dict[str, dict] = {
        name: {
            "total": float(grp.sum()),
            "count": int(grp.count()),
            "cleaned": clean_name(name),
        }
        for name, grp in name_groups
    }

    unique_before = len(name_stats)
    print(f"Unique contributor names before dedup: {unique_before:,}")

    # Cluster
    print(f"Clustering with {SIMILARITY_THRESHOLD}% threshold ...", flush=True)
    clusters = build_clusters(name_stats)

    # Build canonical map
    canonical_map: dict[str, str] = {}
    multi_clusters = 0
    for cluster in clusters:
        canonical = pick_canonical(cluster, name_stats)
        for name in cluster:
            canonical_map[name] = canonical
        if len(cluster) > 1:
            multi_clusters += 1

    unique_after = len({v for v in canonical_map.values()})
    print(f"Unique canonical names after dedup:   {unique_after:,}")
    print(f"Clusters with >1 variant:             {multi_clusters:,}")

    # Show top 10 largest clusters
    large = sorted(
        [c for c in clusters if len(c) > 1],
        key=len,
        reverse=True,
    )[:10]
    if large:
        print("\nTop merged clusters:")
        for cluster in large:
            canonical = pick_canonical(cluster, name_stats)
            variants = [n for n in cluster if n != canonical]
            print(f"  [{len(cluster)}] {canonical!r}")
            for v in variants:
                print(f"         ← {v!r}")

    # Write outputs
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    df["canonical_name"] = df["contributor_name"].map(canonical_map)
    df.to_csv(DEDUPED_CSV, index=False)
    print(f"\nWrote {len(df):,} rows to {DEDUPED_CSV.name}")

    map_df = pd.DataFrame(
        [{"raw_name": k, "canonical_name": v} for k, v in canonical_map.items()]
    ).sort_values("canonical_name")
    map_df.to_csv(DEDUP_MAP_CSV, index=False)
    print(f"Wrote {len(map_df):,} rows to {DEDUP_MAP_CSV.name}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
```

Note: pytest imports this file as `deduplicate_09` — add this alias at the very top of the test file, OR rename the script for imports. The test file uses `from deduplicate_09 import ...` which won't work with a filename starting with a digit. Fix: the test file should do:

```python
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location(
    "dedup", Path(__file__).parent.parent / "scripts" / "09_deduplicate_donors.py"
)
mod = importlib.util.util.from_spec(spec)  # placeholder — see step 4
```

Actually, fix the test import to use `importlib`:

- [ ] **Step 4: Fix test imports to handle numeric filename**

Update `tests/test_09_deduplicate.py` — replace the import block at the top:

```python
# tests/test_09_deduplicate.py
import importlib.util
import sys
from pathlib import Path

# Python can't import files starting with digits directly — use importlib
_spec = importlib.util.spec_from_file_location(
    "dedup09",
    Path(__file__).parent.parent / "scripts" / "09_deduplicate_donors.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

clean_name = _mod.clean_name
get_blocks = _mod.get_blocks
UnionFind = _mod.UnionFind
```

Keep all the test functions exactly as written in Step 1 below that import block.

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_09_deduplicate.py -v
```

Expected:
```
test_clean_name_uppercases          PASSED
test_clean_name_strips_punctuation  PASSED
test_clean_name_collapses_whitespace PASSED
test_get_blocks_groups_by_first_three PASSED
test_get_blocks_short_name_uses_full PASSED
test_union_find_single_item         PASSED
test_union_find_merges              PASSED
test_union_find_clusters            PASSED
8 passed
```

- [ ] **Step 6: Commit**

```bash
git add tests/test_09_deduplicate.py scripts/09_deduplicate_donors.py
git commit -m "feat: add donor deduplication script with union-find clustering"
```

---

## Task 3: Run deduplication on real data

**Files:**
- No new files — runs existing `09_deduplicate_donors.py`

- [ ] **Step 1: Run the deduplication script**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/09_deduplicate_donors.py
```

Expected output (approximate):
```
=== Script 09: Deduplicate Donors ===

Loading contributions.csv ...
Building name statistics ...
Unique contributor names before dedup: 45,000–80,000
Clustering with 75% threshold ...
Unique canonical names after dedup:   40,000–70,000
Clusters with >1 variant:             2,000–10,000

Top merged clusters:
  [3] 'TECO ENERGY, INC.'
         ← 'TECO ENERGY INC'
         ← 'TECO ENERGY INCORPORATED'
  ...

Wrote 166,890 rows to contributions_deduped.csv
Wrote NNN,NNN rows to donor_dedup_map.csv
```

- [ ] **Step 2: Verify output files exist and look correct**

```bash
ls -lh "/Users/loganrubenstein/Claude Projects/florida-donor-tracker/data/processed/"
head -n 3 "/Users/loganrubenstein/Claude Projects/florida-donor-tracker/data/processed/contributions_deduped.csv"
head -n 3 "/Users/loganrubenstein/Claude Projects/florida-donor-tracker/data/processed/donor_dedup_map.csv"
```

Expected: `contributions_deduped.csv` has all original columns plus `canonical_name` at the end. `donor_dedup_map.csv` has two columns: `raw_name`, `canonical_name`.

---

## Task 4: Expenditures ETL — helpers (TDD)

**Files:**
- Create: `tests/test_07_expenditures.py`
- Create: `scripts/07_import_expenditures.py`

- [ ] **Step 1: Write failing test for `parse_amount` (reused from script 01)**

Create `tests/test_07_expenditures.py`:

```python
# tests/test_07_expenditures.py
import importlib.util
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "exp07",
    Path(__file__).parent.parent / "scripts" / "07_import_expenditures.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_amount = _mod.parse_amount
load_one_file = _mod.load_one_file


def test_parse_amount_plain():
    assert parse_amount("1250.00") == 1250.0

def test_parse_amount_with_dollar_and_comma():
    assert parse_amount("$1,250.00") == 1250.0

def test_parse_amount_negative_parens():
    assert parse_amount("(50.00)") == -50.0

def test_parse_amount_empty():
    assert parse_amount("") == 0.0

def test_parse_amount_nan():
    assert parse_amount(float("nan")) == 0.0

def test_load_one_file_reads_tsv(tmp_path):
    """load_one_file should read a tab-delimited file and strip column whitespace."""
    sample = tmp_path / "Expend_test.txt"
    sample.write_text(
        "Date\tAmount\tVendor Name\tPurpose\n"
        "01/15/2024\t500.00\tACME PRINTING\tCAMPAIGN MATERIALS\n",
        encoding="latin-1",
    )
    df = load_one_file(sample)
    assert len(df) == 1
    assert "source_file" in df.columns
    assert df["source_file"].iloc[0] == "Expend_test.txt"
    # Columns should have whitespace stripped
    assert all(c == c.strip() for c in df.columns)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_07_expenditures.py -v 2>&1 | tail -5
```

Expected: `ERROR` — module not found

- [ ] **Step 3: Create `scripts/07_import_expenditures.py`**

```python
# scripts/07_import_expenditures.py
"""
Script 07: Import FL Division of Elections expenditure files.

Reads tab-delimited .txt files from data/raw/expenditures/, normalizes them
into a single clean CSV at data/processed/expenditures.csv.

Since expenditure files won't exist until the FL DOE CGI server comes back up,
this script exits cleanly with a message if the folder is empty.

Column names are auto-detected from real files. Once a real file is seen,
update COLUMN_RENAME below with the actual FL DOE column names.

Usage (from project root, with .venv activated):
    python scripts/07_import_expenditures.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import EXPEND_RAW, PROCESSED_DIR, FL_ENCODING

OUTPUT_FILE = PROCESSED_DIR / "expenditures.csv"

# Populated once we've seen a real FL DOE expenditure file.
# Keys are exact raw column names (whitespace-stripped); values are snake_case.
# If a raw column isn't in this dict, it passes through as-is.
COLUMN_RENAME: dict[str, str] = {
    # Typical FL DOE expenditure columns — update after first real download:
    "Rpt Yr":        "report_year",
    "Rpt Type":      "report_type",
    "Date":          "expenditure_date",
    "Amount":        "amount",
    "Vendor Name":   "vendor_name",
    "Address":       "vendor_address",
    "City State Zip": "vendor_city_state_zip",
    "Purpose":       "purpose",
    "Typ":           "type_code",
}

DATE_COLUMN   = "expenditure_date"
AMOUNT_COLUMN = "amount"


def parse_amount(value) -> float:
    """Convert '$1,250.00' or '(50.00)' to float. Parentheses = negative refund."""
    if pd.isna(value):
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    negative = s.startswith("(") and s.endswith(")")
    s = s.replace("$", "").replace(",", "").replace("(", "").replace(")", "")
    try:
        n = float(s)
    except ValueError:
        return 0.0
    return -n if negative else n


def load_one_file(path: Path) -> pd.DataFrame:
    """Read one FL DOE tab-delimited expenditure file into a clean DataFrame."""
    print(f"  reading {path.name} ...", flush=True)
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]

    # Rename known columns; unknown columns pass through
    rename = {k: v for k, v in COLUMN_RENAME.items() if k in df.columns}
    df = df.rename(columns=rename)

    if DATE_COLUMN in df.columns:
        df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")

    if AMOUNT_COLUMN in df.columns:
        df[AMOUNT_COLUMN] = df[AMOUNT_COLUMN].apply(parse_amount)

    df["source_file"] = path.name
    return df


def main() -> int:
    print("=== Script 07: Import Expenditures ===\n")

    if not EXPEND_RAW.exists():
        print(f"  {EXPEND_RAW} does not exist — skipping (run after CGI server is back up)")
        return 0

    files = sorted(EXPEND_RAW.glob("*.txt"))
    if not files:
        print(f"  No .txt files in {EXPEND_RAW} — skipping (run after CGI server is back up)")
        return 0

    print(f"Found {len(files)} expenditure file(s):")
    for f in files:
        print(f"  - {f.name}")

    print("\nLoading files ...")
    frames = [load_one_file(f) for f in files]
    df = pd.concat(frames, ignore_index=True)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nWrote {len(df):,} rows to {OUTPUT_FILE}")

    print("\n=== SUMMARY ===")
    print(f"Total expenditures: {len(df):,}")
    if AMOUNT_COLUMN in df.columns:
        print(f"Total amount:       ${df[AMOUNT_COLUMN].sum():,.2f}")
    if DATE_COLUMN in df.columns:
        valid = df[DATE_COLUMN].dropna()
        if len(valid):
            print(f"Date range:         {valid.min().date()} to {valid.max().date()}")
    if "vendor_name" in df.columns:
        print("\nTop 10 vendors by row count:")
        print(df["vendor_name"].value_counts().head(10).to_string())

    # Print actual columns found so user can update COLUMN_RENAME if needed
    unknown = [c for c in df.columns if c not in set(COLUMN_RENAME.values()) | {"source_file"}]
    if unknown:
        print(f"\nNote: these columns were not in COLUMN_RENAME and passed through as-is:")
        for c in unknown:
            print(f"  {c!r}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_07_expenditures.py -v
```

Expected:
```
test_parse_amount_plain             PASSED
test_parse_amount_with_dollar_and_comma PASSED
test_parse_amount_negative_parens   PASSED
test_parse_amount_empty             PASSED
test_parse_amount_nan               PASSED
test_load_one_file_reads_tsv        PASSED
6 passed
```

- [ ] **Step 5: Verify script exits cleanly when no files exist**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/07_import_expenditures.py
echo "Exit code: $?"
```

Expected:
```
=== Script 07: Import Expenditures ===

  No .txt files in .../data/raw/expenditures — skipping (run after CGI server is back up)
Exit code: 0
```

- [ ] **Step 6: Commit**

```bash
git add tests/test_07_expenditures.py scripts/07_import_expenditures.py
git commit -m "feat: add expenditures ETL with auto-detected columns"
```

---

## Task 5: JSON export — helpers (TDD)

**Files:**
- Create: `tests/test_08_export_json.py`
- Create: `scripts/08_export_json.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_08_export_json.py`:

```python
# tests/test_08_export_json.py
import importlib.util
import json
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "exp08",
    Path(__file__).parent.parent / "scripts" / "08_export_json.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

is_corporate        = _mod.is_corporate
derive_committee_acct = _mod.derive_committee_acct
build_top_donors    = _mod.build_top_donors
build_donor_flows   = _mod.build_donor_flows


def test_is_corporate_detects_inc():
    assert is_corporate("TECO ENERGY, INC.") is True

def test_is_corporate_detects_llc():
    assert is_corporate("SMITH VENTURES LLC") is True

def test_is_corporate_rejects_individual():
    assert is_corporate("JOHN SMITH") is False

def test_is_corporate_case_insensitive():
    assert is_corporate("acme corporation") is True

def test_derive_committee_acct_standard():
    assert derive_committee_acct("Contrib_4700.txt") == "4700"

def test_derive_committee_acct_rpof_special():
    assert derive_committee_acct("Contrib_2024_rpof.txt") == "4700"

def test_derive_committee_acct_with_spaces():
    # "Contrib_PCO_00001.txt" → "PCO 00001"
    assert derive_committee_acct("Contrib_PCO_00001.txt") == "PCO 00001"

def test_build_top_donors_aggregates(sample_contributions_df):
    # Add canonical_name column (same as contributor_name for this test)
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, n=10)
    assert isinstance(result, list)
    assert len(result) >= 1
    first = result[0]
    assert "name" in first
    assert "total_amount" in first
    assert "num_contributions" in first
    assert "is_corporate" in first
    # TECO ENERGY should be top (2 contributions × ~5000 = ~10000)
    assert result[0]["name"] == "TECO ENERGY, INC."

def test_build_donor_flows_joins_committee(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_donor_flows(df, sample_committees_df, n=10)
    assert isinstance(result, list)
    assert len(result) >= 1
    flow = result[0]
    assert "donor" in flow
    assert "committee" in flow
    assert "committee_acct" in flow
    assert "total_amount" in flow
    assert "num_contributions" in flow
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_08_export_json.py -v 2>&1 | tail -5
```

Expected: `ERROR` — module not found

- [ ] **Step 3: Create `scripts/08_export_json.py`**

```python
# scripts/08_export_json.py
"""
Script 08: Export processed data to JSON files for the public website.

Reads from data/processed/ and writes to public/data/.

Outputs:
  public/data/top_donors.json           — top 100 donors by lifetime $
  public/data/top_corporate_donors.json — top 100 corporate donors
  public/data/donor_flows.json          — top 500 donor→committee pairs
  public/data/committees/{acct}.json    — per-committee: top 25 donors
  public/data/meta.json                 — generation timestamp + counts

Usage (from project root, with .venv activated):
    python scripts/08_export_json.py
    python scripts/08_export_json.py --force
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

PUBLIC_DIR = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR = PUBLIC_DIR / "committees"

# Corporate name keywords (case-insensitive match against full name)
_CORP_KEYWORDS = [
    "INC", "LLC", "CORP", "CO.", "COMPANY", "ASSOCIATION",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS",
]

# Maps known non-standard source filenames to committee acct_nums
_SOURCE_FILE_MAP: dict[str, str] = {
    "Contrib_2024_rpof.txt": "4700",
}


def is_corporate(name: str) -> bool:
    """Return True if the donor name looks like a corporation."""
    upper = name.upper()
    return any(kw in upper for kw in _CORP_KEYWORDS)


def derive_committee_acct(source_file: str) -> str | None:
    """
    Extract committee acct_num from a source filename.

    Standard format: "Contrib_{acct_num}.txt" where acct_num may contain
    underscores representing spaces (e.g. "Contrib_PCO_00001.txt" → "PCO 00001").

    Special cases handled via _SOURCE_FILE_MAP.
    """
    if source_file in _SOURCE_FILE_MAP:
        return _SOURCE_FILE_MAP[source_file]
    stem = Path(source_file).stem  # e.g. "Contrib_4700"
    if stem.startswith("Contrib_"):
        raw = stem[len("Contrib_"):]
        return raw.replace("_", " ")
    return None


def build_top_donors(df: pd.DataFrame, n: int = 100) -> list[dict]:
    """
    Aggregate contributions by canonical_name, return top n by total $.

    Each item: {name, total_amount, num_contributions, is_corporate}
    """
    grouped = (
        df.groupby("canonical_name")["amount"]
        .agg(total_amount="sum", num_contributions="count")
        .reset_index()
        .rename(columns={"canonical_name": "name"})
        .sort_values("total_amount", ascending=False)
        .head(n)
    )
    result = []
    for _, row in grouped.iterrows():
        result.append({
            "name": row["name"],
            "total_amount": round(float(row["total_amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
            "is_corporate": is_corporate(row["name"]),
        })
    return result


def build_top_corporate_donors(df: pd.DataFrame, n: int = 100) -> list[dict]:
    """Filter to corporate donors, then return top n by total $."""
    corp_df = df[df["canonical_name"].apply(is_corporate)]
    return build_top_donors(corp_df, n=n)


def build_donor_flows(
    df: pd.DataFrame,
    committees_df: pd.DataFrame,
    n: int = 500,
) -> list[dict]:
    """
    Build donor→committee flow data.

    Derives committee acct_num from source_file column, joins to committees_df
    for the human-readable name. Returns top n pairs by total $.

    Each item: {donor, committee, committee_acct, total_amount, num_contributions}
    """
    work = df.copy()
    work["committee_acct"] = work["source_file"].apply(derive_committee_acct)
    work = work[work["committee_acct"].notna()]

    # Join to get committee_name
    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()
    work["committee"] = work["committee_acct"].map(acct_to_name).fillna("Unknown")

    grouped = (
        work.groupby(["canonical_name", "committee_acct", "committee"])["amount"]
        .agg(total_amount="sum", num_contributions="count")
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(n)
    )

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "donor": row["canonical_name"],
            "committee": row["committee"],
            "committee_acct": row["committee_acct"],
            "total_amount": round(float(row["total_amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
        })
    return result


def build_per_committee_files(
    df: pd.DataFrame,
    committees_df: pd.DataFrame,
) -> dict[str, dict]:
    """
    Build one summary dict per committee.

    Returns {acct_num: {acct_num, committee_name, total_received,
                        num_contributions, top_donors}}
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
            .head(25)
        )
        top_donors = [
            {
                "name": row["name"],
                "total_amount": round(float(row["total_amount"]), 2),
                "num_contributions": int(row["num_contributions"]),
            }
            for _, row in top_donors_grouped.iterrows()
        ]
        results[acct] = {
            "acct_num": acct,
            "committee_name": acct_to_name.get(acct, "Unknown"),
            "total_received": round(float(group["amount"].sum()), 2),
            "num_contributions": int(len(group)),
            "top_donors": top_donors,
        }
    return results


def write_json(data, path: Path) -> None:
    """Write data as pretty-printed JSON to path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def main(force: bool = False) -> int:
    print("=== Script 08: Export JSON ===\n")

    # Load inputs
    deduped_path = PROCESSED_DIR / "contributions_deduped.csv"
    contribs_path = PROCESSED_DIR / "contributions.csv"
    committees_path = PROCESSED_DIR / "committees.csv"

    if deduped_path.exists():
        print(f"Using {deduped_path.name} (deduplicated)")
        df = pd.read_csv(deduped_path, dtype=str, low_memory=False)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        if "canonical_name" not in df.columns:
            df["canonical_name"] = df["contributor_name"]
    elif contribs_path.exists():
        print(f"Using {contribs_path.name} (not deduplicated — run 09_deduplicate_donors.py first for best results)")
        df = pd.read_csv(contribs_path, dtype=str, low_memory=False)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        df["canonical_name"] = df["contributor_name"]
    else:
        print("ERROR: No contributions data found. Run 01_import_finance.py first.", file=sys.stderr)
        return 1

    if not committees_path.exists():
        print("ERROR: committees.csv not found. Run 05_import_registry.py first.", file=sys.stderr)
        return 1

    committees_df = pd.read_csv(committees_path, dtype=str)
    print(f"Loaded {len(df):,} contributions, {len(committees_df):,} committees\n")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    COMMITTEES_DIR.mkdir(parents=True, exist_ok=True)

    # Top donors
    print("Building top_donors.json ...", flush=True)
    top_donors = build_top_donors(df)
    write_json(top_donors, PUBLIC_DIR / "top_donors.json")
    print(f"  {len(top_donors)} donors")

    # Top corporate donors
    print("Building top_corporate_donors.json ...", flush=True)
    top_corp = build_top_corporate_donors(df)
    write_json(top_corp, PUBLIC_DIR / "top_corporate_donors.json")
    print(f"  {len(top_corp)} corporate donors")

    # Donor flows
    print("Building donor_flows.json ...", flush=True)
    flows = build_donor_flows(df, committees_df)
    write_json(flows, PUBLIC_DIR / "donor_flows.json")
    print(f"  {len(flows)} donor→committee pairs")

    # Per-committee files
    print("Building per-committee files ...", flush=True)
    per_committee = build_per_committee_files(df, committees_df)
    for acct, data in per_committee.items():
        write_json(data, COMMITTEES_DIR / f"{acct}.json")
    print(f"  {len(per_committee)} committee files → public/data/committees/")

    # Meta
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_contributions": int(len(df)),
        "total_committees_with_data": len(per_committee),
        "total_donors": int(df["canonical_name"].nunique()),
        "date_range": {
            "earliest": str(df["contribution_date"].min()) if "contribution_date" in df.columns else None,
            "latest":   str(df["contribution_date"].max()) if "contribution_date" in df.columns else None,
        },
    }
    write_json(meta, PUBLIC_DIR / "meta.json")
    print("Wrote meta.json")

    print(f"\nAll files written to {PUBLIC_DIR}")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_08_export_json.py -v
```

Expected:
```
test_is_corporate_detects_inc           PASSED
test_is_corporate_detects_llc           PASSED
test_is_corporate_rejects_individual    PASSED
test_is_corporate_case_insensitive      PASSED
test_derive_committee_acct_standard     PASSED
test_derive_committee_acct_rpof_special PASSED
test_derive_committee_acct_with_spaces  PASSED
test_build_top_donors_aggregates        PASSED
test_build_donor_flows_joins_committee  PASSED
9 passed
```

- [ ] **Step 5: Run full test suite — all green**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/ -v 2>&1 | tail -10
```

Expected: all 23 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add tests/test_08_export_json.py scripts/08_export_json.py
git commit -m "feat: add JSON export script for top donors, corporate donors, and donor flows"
```

---

## Task 6: Run JSON export on real data

**Files:**
- No new files

- [ ] **Step 1: Run the JSON export**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/08_export_json.py
```

Expected output:
```
=== Script 08: Export JSON ===

Using contributions_deduped.csv (deduplicated)
Loaded 166,890 contributions, 1,888 committees

Building top_donors.json ...
  100 donors
Building top_corporate_donors.json ...
  100 corporate donors
Building donor_flows.json ...
  NNN donor→committee pairs
Building per-committee files ...
  1 committee files → public/data/committees/
Wrote meta.json

All files written to .../public/data
```

- [ ] **Step 2: Inspect the output files**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
# Check files exist and have reasonable sizes
ls -lh public/data/
ls -lh public/data/committees/

# Spot-check top donors
python -c "
import json
donors = json.load(open('public/data/top_donors.json'))
print('Top 5 donors:')
for d in donors[:5]:
    print(f'  \${d[\"total_amount\"]:>15,.2f}  {d[\"name\"]}  (corporate={d[\"is_corporate\"]})')
"

# Spot-check donor flows
python -c "
import json
flows = json.load(open('public/data/donor_flows.json'))
print('Top 5 flows:')
for f in flows[:5]:
    print(f'  \${f[\"total_amount\"]:>12,.2f}  {f[\"donor\"][:30]} → {f[\"committee\"][:30]}')
"
```

- [ ] **Step 3: Commit outputs note**

The `public/data/` directory is in `.gitignore`, so JSON files won't be committed (correct — they're regenerated by the pipeline). No commit needed here.

---

## Task 7: Update orchestrator

**Files:**
- Modify: `scripts/06_orchestrate.py`

- [ ] **Step 1: Add new steps to STEPS list**

Open `scripts/06_orchestrate.py` and update the `STEPS` list:

```python
STEPS = [
    ("Download registry",         "02_download_registry.py",    []),
    ("Import registry",           "05_import_registry.py",      []),
    ("Scrape contributions",      "03_scrape_contributions.py",  []),
    ("Scrape expenditures",       "04_scrape_expenditures.py",   []),
    ("Import contributions ETL",  "01_import_finance.py",        []),
    ("Import expenditures ETL",   "07_import_expenditures.py",   []),
    ("Deduplicate donors",        "09_deduplicate_donors.py",    []),
    ("Export JSON",               "08_export_json.py",           []),
]
```

- [ ] **Step 2: Run orchestrator dry-run (steps 1-2 only, already complete)**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/02_download_registry.py 2>&1 | head -5
```

Expected: `Skipped — already exists` for both files. Confirms resumability still works.

- [ ] **Step 3: Run full test suite one final time**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/06_orchestrate.py
git commit -m "feat: add dedup, expenditures ETL, and JSON export to orchestrator pipeline"
```

---

## Verification

After all tasks complete, run this end-to-end check:

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate

# All tests pass
python -m pytest tests/ -v

# Deduped contributions exist
ls -lh data/processed/contributions_deduped.csv
wc -l data/processed/contributions_deduped.csv

# JSON outputs exist and are valid
python -c "
import json, pathlib
for f in sorted(pathlib.Path('public/data').glob('*.json')):
    data = json.loads(f.read_text())
    n = len(data) if isinstance(data, list) else 'object'
    print(f'{f.name:40s} {n} items, {f.stat().st_size//1024} KB')
"

# Spot-check: top corporate donor should be a recognizable FL company
python -c "
import json
corps = json.load(open('public/data/top_corporate_donors.json'))
print('Top corporate donor:', corps[0]['name'], '\$'+str(corps[0]['total_amount']))
"
```
