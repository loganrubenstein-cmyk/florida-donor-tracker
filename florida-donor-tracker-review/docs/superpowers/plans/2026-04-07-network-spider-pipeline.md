# Network Spider Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/10_spider_graph.py` — a pipeline script that reads existing processed contribution data, identifies which donors are themselves registered FL committees, and exports `public/data/network_graph.json` with nodes, edges, and metadata for the `/network` visualization page.

**Architecture:** Pure data-transformation script (no HTTP calls). Reads `contributions_deduped.csv` + `committees.csv`, builds a committee name lookup using `clean_name()` from script 09, matches donor names against registered committees, builds graph nodes and edges (top-25 donors per committee), and exports JSON. Committees that appear as donors but have no contribution file are flagged `data_pending: true` — the user runs script 03 for those committees, then re-runs script 10 to deepen the graph.

**Tech Stack:** Python 3.14, pandas, json, importlib (for digit-prefixed script imports), pytest. No new packages needed.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `scripts/10_spider_graph.py` | Full pipeline: load data, match names, build graph, export JSON |
| Create | `tests/test_10_spider_graph.py` | Unit tests for all helpers |
| Modify | `scripts/06_orchestrate.py` | Add step 10 after step 08 |

**Reused from existing scripts (do not duplicate):**
- `clean_name()` — `scripts/09_deduplicate_donors.py` (imported via `importlib`)
- `is_corporate()` — `scripts/08_export_json.py` (imported via `importlib`)
- `PROCESSED_DIR`, `CONTRIB_RAW`, `PROJECT_ROOT` — `scripts/config.py`

---

## Task 1: Test scaffold + core helper functions (TDD)

**Files:**
- Create: `tests/test_10_spider_graph.py`
- Create: `scripts/10_spider_graph.py` (helpers only — no `main()` yet)

- [ ] **Step 1: Create `tests/test_10_spider_graph.py` with failing tests**

```python
# tests/test_10_spider_graph.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

# Load script 10 via importlib (filename starts with digit)
_spec = importlib.util.spec_from_file_location(
    "spider10",
    Path(__file__).parent.parent / "scripts" / "10_spider_graph.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_name_lookup  = _mod.build_name_lookup
make_node_id       = _mod.make_node_id
classify_node_type = _mod.classify_node_type
build_edges        = _mod.build_edges
build_nodes        = _mod.build_nodes


# ── build_name_lookup ──────────────────────────────────────────────────────

def test_build_name_lookup_basic():
    df = pd.DataFrame({
        "acct_num": ["4700", "12345"],
        "committee_name": ["Republican Party of Florida", "Friends of Ron DeSantis"],
    })
    lookup = build_name_lookup(df)
    # Keys are cleaned (upper, no punct)
    assert lookup["REPUBLICAN PARTY OF FLORIDA"] == "4700"
    assert lookup["FRIENDS OF RON DESANTIS"] == "12345"

def test_build_name_lookup_cleans_punctuation():
    df = pd.DataFrame({
        "acct_num": ["99"],
        "committee_name": ["U.S. Sugar Corp."],
    })
    lookup = build_name_lookup(df)
    assert "US SUGAR CORP" in lookup

def test_build_name_lookup_skips_blank_acct():
    df = pd.DataFrame({
        "acct_num": ["4700", ""],
        "committee_name": ["RPOF", "Ghost"],
    })
    lookup = build_name_lookup(df)
    assert "GHOST" not in lookup


# ── make_node_id ───────────────────────────────────────────────────────────

def test_make_node_id_committee():
    assert make_node_id(acct_num="4700") == "c_4700"

def test_make_node_id_donor_slugifies():
    nid = make_node_id(canonical_name="FLORIDA POWER & LIGHT COMPANY")
    assert nid.startswith("d_")
    assert "&" not in nid
    assert " " not in nid

def test_make_node_id_acct_takes_priority():
    # If both given, acct_num wins → committee node
    assert make_node_id(acct_num="4700", canonical_name="RPOF") == "c_4700"


# ── classify_node_type ─────────────────────────────────────────────────────

def test_classify_node_type_committee():
    assert classify_node_type("RPOF", acct_num="4700") == "committee"

def test_classify_node_type_corporate():
    assert classify_node_type("TECO ENERGY INC", acct_num=None) == "corporate"

def test_classify_node_type_individual():
    assert classify_node_type("JOHN SMITH", acct_num=None) == "individual"


# ── build_edges ────────────────────────────────────────────────────────────

@pytest.fixture
def contrib_df():
    return pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC", "JOHN SMITH", "TECO ENERGY INC", "US SUGAR CORP"],
        "amount":         [5000.0, 1000.0, 3000.0, 8000.0],
        "source_file":    ["Contrib_4700.txt"] * 4,
    })

def test_build_edges_top_n(contrib_df):
    name_lookup = {"US SUGAR CORP": "99999"}
    edges = build_edges(contrib_df, name_lookup, spidered_accts=["4700"], top_n=2)
    # top 2 donors to 4700: US SUGAR ($8k) and TECO ($8k combined)
    assert len(edges) == 2
    totals = {e["total_amount"] for e in edges}
    assert 8000.0 in totals

def test_build_edges_structure(contrib_df):
    edges = build_edges(contrib_df, {}, spidered_accts=["4700"], top_n=25)
    for e in edges:
        assert "source" in e
        assert "target" in e
        assert "total_amount" in e
        assert "num_contributions" in e

def test_build_edges_committee_donor_uses_c_prefix(contrib_df):
    name_lookup = {"US SUGAR CORP": "99999"}
    edges = build_edges(contrib_df, name_lookup, spidered_accts=["4700"], top_n=25)
    sugar_edge = next(e for e in edges if "99999" in e["source"])
    assert sugar_edge["source"] == "c_99999"
    assert sugar_edge["target"] == "c_4700"


# ── build_nodes ────────────────────────────────────────────────────────────

def test_build_nodes_includes_spidered_committee(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700"],
        "committee_name": ["Republican Party of Florida"],
    })
    name_lookup = {}
    nodes = build_nodes(contrib_df, name_lookup, committees_df,
                        spidered_accts=["4700"], pending_accts=set(),
                        depth_map={"4700": 0})
    ids = [n["id"] for n in nodes]
    assert "c_4700" in ids

def test_build_nodes_data_pending_flag(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700", "99999"],
        "committee_name": ["RPOF", "US Sugar PAC"],
    })
    name_lookup = {"US SUGAR CORP": "99999"}
    nodes = build_nodes(contrib_df, name_lookup, committees_df,
                        spidered_accts=["4700"], pending_accts={"99999"},
                        depth_map={"4700": 0, "99999": 1})
    sugar_node = next(n for n in nodes if n["id"] == "c_99999")
    assert sugar_node["data_pending"] is True

def test_build_nodes_committee_has_depth(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700"],
        "committee_name": ["RPOF"],
    })
    nodes = build_nodes(contrib_df, {}, committees_df,
                        spidered_accts=["4700"], pending_accts=set(),
                        depth_map={"4700": 0})
    rpof = next(n for n in nodes if n["id"] == "c_4700")
    assert rpof["depth"] == 0
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_10_spider_graph.py -v 2>&1 | tail -5
```

Expected: `ERROR` — `ModuleNotFoundError` / file not found.

- [ ] **Step 3: Create `scripts/10_spider_graph.py` with helpers**

```python
# scripts/10_spider_graph.py
"""
Script 10: Spider the donation graph and export network_graph.json.

Reads contributions_deduped.csv (or contributions.csv) and committees.csv.
Matches donor canonical_names against registered committee names to discover
which donors are themselves committees. Builds a nodes+edges graph and
exports public/data/network_graph.json.

Committees that appear as donors but have no contribution file are marked
data_pending=true. Run script 03 for those acct_nums then re-run this script
to deepen the graph.

Usage (from project root, with .venv activated):
    python scripts/10_spider_graph.py
    python scripts/10_spider_graph.py --force   # overwrite existing JSON
"""

import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, CONTRIB_RAW, PROJECT_ROOT

PUBLIC_DIR  = PROJECT_ROOT / "public" / "data"
OUTPUT_FILE = PUBLIC_DIR / "network_graph.json"

# ── Import clean_name from 09_deduplicate_donors.py (digit prefix) ──────────
_spec09 = importlib.util.spec_from_file_location(
    "_dedup09", Path(__file__).parent / "09_deduplicate_donors.py"
)
_mod09 = importlib.util.module_from_spec(_spec09)
_spec09.loader.exec_module(_mod09)
_clean_name = _mod09.clean_name

# ── Import is_corporate from 08_export_json.py (digit prefix) ───────────────
_spec08 = importlib.util.spec_from_file_location(
    "_export08", Path(__file__).parent / "08_export_json.py"
)
_mod08 = importlib.util.module_from_spec(_spec08)
_spec08.loader.exec_module(_mod08)
_is_corporate = _mod08.is_corporate

_SLUG_RE = re.compile(r"[^A-Z0-9]+")


# ── Helpers ──────────────────────────────────────────────────────────────────

def build_name_lookup(committees_df: pd.DataFrame) -> dict:
    """
    Map cleaned committee name → acct_num.
    Skips rows with blank acct_num.
    """
    lookup = {}
    for _, row in committees_df.iterrows():
        acct = str(row.get("acct_num", "")).strip()
        if not acct:
            continue
        name = str(row.get("committee_name", "")).strip()
        cleaned = _clean_name(name)
        if cleaned:
            lookup[cleaned] = acct
    return lookup


def make_node_id(acct_num: str = None, canonical_name: str = None) -> str:
    """
    Return a stable node ID.
    Committees: 'c_{acct_num}'
    Donors:     'd_{SLUG}'
    acct_num takes priority if both are provided.
    """
    if acct_num:
        return f"c_{acct_num}"
    slug = _SLUG_RE.sub("_", (canonical_name or "").upper()).strip("_")
    return f"d_{slug}"


def classify_node_type(canonical_name: str, acct_num: str = None) -> str:
    """Return 'committee', 'corporate', or 'individual'."""
    if acct_num:
        return "committee"
    if _is_corporate(canonical_name):
        return "corporate"
    return "individual"


def _source_file_for_acct(acct_num: str) -> str:
    """Return the expected raw filename for a committee acct_num."""
    safe = acct_num.replace(" ", "_").replace("/", "_")
    return f"Contrib_{safe}.txt"


def build_edges(
    df: pd.DataFrame,
    name_lookup: dict,
    spidered_accts: list,
    top_n: int = 25,
) -> list:
    """
    For each spidered committee, aggregate top_n donors and return edge dicts.

    Each edge: {source, target, total_amount, num_contributions}
    source/target are node IDs (c_ or d_ prefixed).
    """
    edges = []
    for acct_num in spidered_accts:
        source_file = _source_file_for_acct(acct_num)
        subset = df[df["source_file"] == source_file]
        if subset.empty:
            continue

        col = "canonical_name" if "canonical_name" in subset.columns else "contributor_name"
        grouped = (
            subset.groupby(col)["amount"]
            .agg(total_amount="sum", num_contributions="count")
            .reset_index()
            .sort_values("total_amount", ascending=False)
            .head(top_n)
        )

        target_id = f"c_{acct_num}"
        for _, row in grouped.iterrows():
            donor_name = row[col]
            donor_acct = name_lookup.get(_clean_name(donor_name))
            source_id = make_node_id(acct_num=donor_acct, canonical_name=donor_name)
            edges.append({
                "source": source_id,
                "target": target_id,
                "total_amount": round(float(row["total_amount"]), 2),
                "num_contributions": int(row["num_contributions"]),
            })
    return edges


def build_nodes(
    df: pd.DataFrame,
    name_lookup: dict,
    committees_df: pd.DataFrame,
    spidered_accts: list,
    pending_accts: set,
    depth_map: dict,
    top_n: int = 25,
) -> list:
    """
    Build node dicts for all spidered committees and their top donors.

    Each node: {id, label, type, acct_num, total_received, total_given,
                num_contributions_in, depth, data_pending}
    """
    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()
    nodes: dict = {}

    # Add a committee node for every spidered acct
    for acct_num in spidered_accts:
        node_id = f"c_{acct_num}"
        source_file = _source_file_for_acct(acct_num)
        subset = df[df["source_file"] == source_file]
        nodes[node_id] = {
            "id": node_id,
            "label": acct_to_name.get(acct_num, acct_num),
            "type": "committee",
            "acct_num": acct_num,
            "total_received": round(float(subset["amount"].sum()), 2),
            "total_given": 0.0,
            "num_contributions_in": int(len(subset)),
            "depth": depth_map.get(acct_num, 0),
            "data_pending": False,
        }

    # Add donor nodes for top-N donors of each spidered committee
    for acct_num in spidered_accts:
        source_file = _source_file_for_acct(acct_num)
        subset = df[df["source_file"] == source_file]
        if subset.empty:
            continue

        col = "canonical_name" if "canonical_name" in subset.columns else "contributor_name"
        top_donors = (
            subset.groupby(col)["amount"]
            .sum()
            .sort_values(ascending=False)
            .head(top_n)
        )

        for donor_name, total in top_donors.items():
            donor_acct = name_lookup.get(_clean_name(donor_name))
            node_id = make_node_id(acct_num=donor_acct, canonical_name=donor_name)

            if node_id not in nodes:
                depth = depth_map.get(donor_acct, depth_map.get(acct_num, 0) + 1) if donor_acct else depth_map.get(acct_num, 0) + 1
                nodes[node_id] = {
                    "id": node_id,
                    "label": donor_name,
                    "type": classify_node_type(donor_name, donor_acct),
                    "acct_num": donor_acct,
                    "total_received": 0.0,
                    "total_given": 0.0,
                    "num_contributions_in": 0,
                    "depth": depth,
                    "data_pending": donor_acct in pending_accts if donor_acct else False,
                }

            nodes[node_id]["total_given"] = round(
                nodes[node_id]["total_given"] + float(total), 2
            )

    return list(nodes.values())


def main(force: bool = False) -> int:
    print("=== Script 10: Spider Graph ===\n")

    if OUTPUT_FILE.exists() and not force:
        print(f"Skipped — {OUTPUT_FILE} already exists (use --force to rebuild)")
        return 0

    # Load contributions
    deduped = PROCESSED_DIR / "contributions_deduped.csv"
    raw_csv = PROCESSED_DIR / "contributions.csv"
    if deduped.exists():
        print(f"Loading {deduped.name} ...")
        df = pd.read_csv(deduped, dtype=str, low_memory=False)
    elif raw_csv.exists():
        print(f"Loading {raw_csv.name} (not deduplicated) ...")
        df = pd.read_csv(raw_csv, dtype=str, low_memory=False)
    else:
        print("ERROR: No contributions CSV found. Run 01_import_finance.py first.", file=sys.stderr)
        return 1

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    # Load committees
    committees_path = PROCESSED_DIR / "committees.csv"
    if not committees_path.exists():
        print("ERROR: committees.csv not found. Run 05_import_registry.py first.", file=sys.stderr)
        return 1
    committees_df = pd.read_csv(committees_path, dtype=str)

    # Build name lookup
    print("Building committee name lookup ...", flush=True)
    name_lookup = build_name_lookup(committees_df)

    # Determine which acct_nums already have raw contribution files
    existing_files = {f.name for f in CONTRIB_RAW.glob("Contrib_*.txt")}

    # Seed queue with acct_nums derived from source_file column
    def acct_from_source(fname: str) -> str | None:
        stem = Path(fname).stem  # e.g. "Contrib_4700"
        if stem.startswith("Contrib_"):
            return stem[len("Contrib_"):].replace("_", " ")
        return None

    source_files = df["source_file"].dropna().unique()
    queue: list[tuple[str, int]] = []   # (acct_num, depth)
    visited: set[str] = set()
    depth_map: dict[str, int] = {}

    for sf in source_files:
        acct = acct_from_source(sf)
        if acct and acct not in visited:
            queue.append((acct, 0))
            visited.add(acct)
            depth_map[acct] = 0

    spidered_accts: list[str] = []
    pending_accts: set[str] = set()

    # BFS: discover committee donors
    print("Spidering committee donation graph ...", flush=True)
    while queue:
        acct_num, depth = queue.pop(0)
        spidered_accts.append(acct_num)

        source_file = _source_file_for_acct(acct_num)
        subset = df[df["source_file"] == source_file]
        if subset.empty:
            continue

        col = "canonical_name" if "canonical_name" in subset.columns else "contributor_name"
        top_donors = (
            subset.groupby(col)["amount"]
            .sum()
            .sort_values(ascending=False)
            .head(25)
        )

        for donor_name in top_donors.index:
            donor_acct = name_lookup.get(_clean_name(donor_name))
            if not donor_acct or donor_acct in visited:
                continue
            visited.add(donor_acct)
            depth_map[donor_acct] = depth + 1

            donor_file = _source_file_for_acct(donor_acct)
            if donor_file in existing_files:
                # We already have their data — add to queue to spider further
                queue.append((donor_acct, depth + 1))
            else:
                # No data yet — mark pending, don't recurse
                pending_accts.add(donor_acct)
                spidered_accts.append(donor_acct)

    print(f"  Committees spidered (have data): {len([a for a in spidered_accts if a not in pending_accts])}")
    print(f"  Committees pending (no file yet): {len(pending_accts)}")

    # Build graph
    print("Building nodes and edges ...", flush=True)
    nodes = build_nodes(df, name_lookup, committees_df, spidered_accts,
                        pending_accts, depth_map)
    edges = build_edges(df, name_lookup, spidered_accts)

    max_depth = max((n["depth"] for n in nodes), default=0)

    graph = {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "committees_spidered": [a for a in spidered_accts if a not in pending_accts],
            "committees_pending": sorted(pending_accts),
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "max_depth": max_depth,
        },
    }

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(nodes)} nodes, {len(edges)} edges → {OUTPUT_FILE}")

    if pending_accts:
        print(f"\n⚠  {len(pending_accts)} committee(s) have no contribution file yet.")
        print("   Run script 03 for these acct_nums then re-run script 10:")
        for acct in sorted(pending_accts)[:10]:
            name = committees_df.set_index("acct_num")["committee_name"].get(acct, acct)
            print(f"   • {acct}  ({name})")
        if len(pending_accts) > 10:
            print(f"   ... and {len(pending_accts) - 10} more (see meta.committees_pending in JSON)")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
```

- [ ] **Step 4: Run failing tests — expect import to succeed, some tests to fail**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/test_10_spider_graph.py -v 2>&1 | tail -20
```

Expected: All 15 tests pass. If any fail, fix the helper before proceeding.

- [ ] **Step 5: Run full test suite — confirm nothing regressed**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/ -v 2>&1 | tail -5
```

Expected: all 38 tests pass (23 existing + 15 new).

- [ ] **Step 6: Commit**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
git add scripts/10_spider_graph.py tests/test_10_spider_graph.py
git commit -m "feat: add network spider graph builder (script 10)"
```

---

## Task 2: Run script 10 on real data and verify output

**Files:**
- No new files — runs existing script against real CSVs.

- [ ] **Step 1: Run script 10**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/10_spider_graph.py
```

Expected output (approximate — numbers from real data):
```
=== Script 10: Spider Graph ===

Loading contributions_deduped.csv ...
Building committee name lookup ...
Spidering committee donation graph ...
  Committees spidered (have data): 1
  Committees pending (no file yet): N

Building nodes and edges ...

Wrote NNN nodes, NNN edges → .../public/data/network_graph.json

⚠  N committee(s) have no contribution file yet.
   Run script 03 for these acct_nums then re-run script 10:
   • XXXXX  (Friends of Ron DeSantis)
   ...
```

- [ ] **Step 2: Verify JSON structure**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python3 -c "
import json
g = json.load(open('public/data/network_graph.json'))
print('nodes:', len(g['nodes']))
print('edges:', len(g['edges']))
print('meta:', json.dumps(g['meta'], indent=2))
print()
print('Sample node:')
print(json.dumps(g['nodes'][0], indent=2))
print()
print('Sample edge:')
print(json.dumps(g['edges'][0], indent=2))
"
```

Expected: `nodes` count in the hundreds, `edges` count roughly 25× number of spidered committees. Sample node has all required keys (`id`, `label`, `type`, `acct_num`, `total_received`, `total_given`, `num_contributions_in`, `depth`, `data_pending`). Sample edge has `source`, `target`, `total_amount`, `num_contributions`.

- [ ] **Step 3: Spot-check node IDs are consistent with edges**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python3 -c "
import json
g = json.load(open('public/data/network_graph.json'))
node_ids = {n['id'] for n in g['nodes']}
missing = [(e['source'], e['target']) for e in g['edges']
           if e['source'] not in node_ids or e['target'] not in node_ids]
if missing:
    print('BROKEN REFERENCES:', missing[:5])
else:
    print('All edge references valid ✓')
"
```

Expected: `All edge references valid ✓`

---

## Task 3: Update orchestrator

**Files:**
- Modify: `scripts/06_orchestrate.py`

- [ ] **Step 1: Read current STEPS**

Open `scripts/06_orchestrate.py` and find the `STEPS` list (currently ends with `"Export JSON", "08_export_json.py"`).

- [ ] **Step 2: Add step 10**

Replace the current `STEPS` list with:

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
    ("Spider network graph",      "10_spider_graph.py",          []),
]
```

- [ ] **Step 3: Verify orchestrator still runs cleanly (dry run step 1 only)**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python scripts/02_download_registry.py 2>&1 | head -3
```

Expected: `Skipped — already exists` (files already present). Confirms step 1 still runs without error.

- [ ] **Step 4: Run final full test suite**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
source .venv/bin/activate
python -m pytest tests/ -v 2>&1 | tail -5
```

Expected: all 38 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
git add scripts/06_orchestrate.py
git commit -m "feat: add spider network graph step to orchestrator pipeline"
```

---

## End-state verification

You should be able to do all of these without errors:

1. `python -m pytest tests/ -v` → 38 tests pass
2. `python scripts/10_spider_graph.py --force` → prints node/edge counts, writes JSON
3. `python -c "import json; g=json.load(open('public/data/network_graph.json')); print(g['meta'])"` → shows valid meta with `generated_at`, `total_nodes`, `total_edges`
4. All edge `source`/`target` values appear in the `nodes` list

---

## Note on Plan 2 (Frontend)

This plan delivers the pipeline only. The Next.js `/network` frontend is **Plan 2** — it reads `network_graph.json` and renders the satellite visualization. Plan 2 should be written as a separate spec+plan once this pipeline is confirmed working end-to-end, since the entire Next.js project needs to be scaffolded from scratch.
