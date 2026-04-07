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
            "data_pending": acct_num in pending_accts,
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
    def acct_from_source(fname: str):
        stem = Path(fname).stem  # e.g. "Contrib_4700"
        if stem.startswith("Contrib_"):
            return stem[len("Contrib_"):].replace("_", " ")
        return None

    source_files = df["source_file"].dropna().unique()
    queue: list = []   # (acct_num, depth)
    visited: set = set()
    depth_map: dict = {}

    for sf in source_files:
        acct = acct_from_source(sf)
        if acct and acct not in visited:
            queue.append((acct, 0))
            visited.add(acct)
            depth_map[acct] = 0

    spidered_accts: list = []
    pending_accts: set = set()

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
        acct_name_map = committees_df.set_index("acct_num")["committee_name"].to_dict()
        for acct in sorted(pending_accts)[:10]:
            name = acct_name_map.get(acct, acct)
            print(f"   • {acct}  ({name})")
        if len(pending_accts) > 10:
            print(f"   ... and {len(pending_accts) - 10} more (see meta.committees_pending in JSON)")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
