# scripts/09_deduplicate_donors.py
"""
Script 09: Deduplicate contributor names using fuzzy string matching.

Reads contributions.csv, clusters similar contributor names, picks a canonical
spelling per cluster, and writes contributions_deduped.csv + donor_dedup_map.csv.

Usage (from project root, with .venv activated):
    python scripts/09_deduplicate_donors.py
    python scripts/09_deduplicate_donors.py --force
"""

import re
import sys
from pathlib import Path

import pandas as pd
from thefuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

SIMILARITY_THRESHOLD          = 90  # token_sort_ratio score for non-corporate names
SIMILARITY_THRESHOLD_CORPORATE = 80  # looser threshold for corporate/PAC names (handles punctuation variants)

# Output paths
DEDUPED_CSV   = PROCESSED_DIR / "contributions_deduped.csv"
DEDUP_MAP_CSV = PROCESSED_DIR / "donor_dedup_map.csv"

_PUNCT_RE = re.compile(r"[^A-Z0-9\s]")


def clean_name(name: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace for comparison."""
    upper = str(name).upper()
    no_punct = _PUNCT_RE.sub("", upper)
    return " ".join(no_punct.split())


_CORP_KEYWORDS = frozenset([
    "INC", "LLC", "CORP", "CO.", "COMPANY", "ASSOCIATION",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS",
])


def is_corporate_name(cleaned: str) -> bool:
    """Return True if the cleaned name looks like a corporation or PAC."""
    words = set(cleaned.split())
    return bool(words & _CORP_KEYWORDS)


def get_blocks(cleaned_to_key: dict) -> dict:
    """
    Group raw names by the first 5 characters of their cleaned form.
    cleaned_to_key maps raw_name -> cleaned_name.
    Returns dict: block_key -> [raw_name, ...]
    """
    blocks: dict = {}
    for raw, cleaned in cleaned_to_key.items():
        key = cleaned[:5] if len(cleaned) >= 5 else cleaned
        blocks.setdefault(key, []).append(raw)
    return blocks


class UnionFind:
    """Disjoint-set data structure for clustering matched names."""

    def __init__(self, items: list):
        self.parent = {item: item for item in items}

    def find(self, item: str) -> str:
        if self.parent[item] != item:
            self.parent[item] = self.find(self.parent[item])
        return self.parent[item]

    def union(self, a: str, b: str) -> None:
        self.parent[self.find(a)] = self.find(b)

    def clusters(self) -> list:
        groups: dict = {}
        for item in self.parent:
            root = self.find(item)
            groups.setdefault(root, []).append(item)
        return list(groups.values())


def build_clusters(
    name_stats: dict,
    threshold: int = SIMILARITY_THRESHOLD,
) -> list:
    """
    Find clusters of similar contributor names.

    name_stats: {raw_name: {"total": float, "count": int, "cleaned": str}}
    Returns list of clusters (each cluster is a list of raw names).

    Matching rules:
    - Corporate/PAC names: SIMILARITY_THRESHOLD_CORPORATE, no length guard
      (handles "TECO ENERGY INC" vs "TECO ENERGY, INC." and similar punctuation variants)
    - Individual names: SIMILARITY_THRESHOLD (higher), plus length-ratio guard
      (prevents "JOHN SMITH" merging with "JOHN WILLIAM SMITH")
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
                a_cleaned = name_stats[a]["cleaned"]
                b_cleaned = name_stats[b]["cleaned"]

                corp_a = is_corporate_name(a_cleaned)
                corp_b = is_corporate_name(b_cleaned)
                either_corporate = corp_a or corp_b

                # Length-ratio guard for individual names:
                # skip pairs where one name is >33% longer than the other
                if not either_corporate:
                    len_a, len_b = len(a_cleaned), len(b_cleaned)
                    if len_a > 0 and len_b > 0:
                        len_ratio = min(len_a, len_b) / max(len_a, len_b)
                        if len_ratio < 0.67:
                            continue

                score = fuzz.token_sort_ratio(a_cleaned, b_cleaned)
                required = SIMILARITY_THRESHOLD_CORPORATE if either_corporate else SIMILARITY_THRESHOLD
                if score >= required:
                    uf.union(a, b)

    return uf.clusters()


def pick_canonical(cluster: list, name_stats: dict) -> str:
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
    name_stats: dict = {
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
    print(f"Clustering (individual threshold={SIMILARITY_THRESHOLD}%, corporate threshold={SIMILARITY_THRESHOLD_CORPORATE}%, block=5-char) ...", flush=True)
    clusters = build_clusters(name_stats)

    # Build canonical map
    canonical_map: dict = {}
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
