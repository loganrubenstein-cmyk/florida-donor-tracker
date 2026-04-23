# scripts/16_match_principals.py
"""
Script 16: Match lobbyist principals to campaign finance contributors.

Enables "The Connection" feature:
  "Principal X funds Candidate Y AND employs lobbyists active on bills
   before Y's committee."

Approach
--------
1. Load lobbyist principals (4,300 unique orgs from principals.csv).
2. Load unique canonical contributor names from contributions.
3. Normalize both sides: uppercase, strip legal suffixes (INC, LLC …),
   strip punctuation, collapse whitespace.
4. Block via inverted token index: for each principal find contributor
   candidates that share at least one significant token.
5. Score candidates with rapidfuzz token_set_ratio; keep score >= MATCH_THRESHOLD.

Outputs
-------
  data/processed/principal_matches.csv
      principal_name, contributor_name, match_score, match_type

Usage (from project root, with .venv activated):
    python scripts/16_match_principals.py
    python scripts/16_match_principals.py --force
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

# Minimum score (0-100) to record a match
MATCH_THRESHOLD = 82

# Common legal/org suffixes to strip before matching
_SUFFIXES = re.compile(
    r"\b(INC|LLC|LLP|CORP|CO|LTD|PA|PLLC|PC|NA|NV|SA|AG|PLC|"
    r"INCORPORATED|CORPORATION|COMPANY|LIMITED|ASSOCIATES|ASSOCIATION|"
    r"ASSOCIATION OF|AUTHORITY|COMMITTEE|COUNCIL|FOUNDATION|"
    r"GROUP|HOLDINGS|INDUSTRIES|INTERNATIONAL|MANAGEMENT|PARTNERS|"
    r"PARTNERSHIP|PROPERTIES|SERVICES|SOLUTIONS|SYSTEMS|TECHNOLOGIES|"
    r"TECHNOLOGY|TRUST|VENTURES|US|USA|U\.?S\.?A?)\b",
    re.IGNORECASE,
)

# Punctuation / filler to remove
_PUNCT = re.compile(r"[^\w\s]")
_SPACE = re.compile(r"\s+")

# Stop-words: tokens so common they don't help block
_STOPWORDS = {
    "AND", "OF", "THE", "FOR", "IN", "AT", "BY", "TO", "A", "AN",
    "FL", "FLORIDA", "STATE", "NATIONAL", "AMERICAN",
}

# Tokens shorter than this are skipped in the blocking index. Kept at 3 so
# noisy 1-2 char tokens (IN, OF, AT, T, …) don't balloon candidate pools.
# Short brand names (AT&T → "AT T", 3M, BP, GE, …) whose tokens are ALL below
# this threshold rely on the full-form fallback block key instead.
_MIN_TOKEN_LEN = 3

# Prefix for fallback full-form block keys. Symmetric on both sides:
# every principal and every contributor is indexed under their full
# normalized form (e.g. "__FULL__:AT T"). This guarantees short-name
# principals whose tokens are all filtered out by _MIN_TOKEN_LEN still
# enter the candidate pool. Match quality is still gated by
# MATCH_THRESHOLD + token_set_ratio, so noise stays out.
_FULL_PREFIX = "__FULL__:"


def _normalize(name: str) -> str:
    """Return a normalized string for fuzzy comparison."""
    s = str(name).upper()
    s = _PUNCT.sub(" ", s)
    s = _SUFFIXES.sub(" ", s)
    s = _SPACE.sub(" ", s).strip()
    return s


def _block_tokens(normalized: str) -> list[str]:
    """Extract significant tokens for the inverted index."""
    return [
        t for t in normalized.split()
        if len(t) >= _MIN_TOKEN_LEN and t not in _STOPWORDS
    ]


def _all_block_keys(normalized: str) -> list[str]:
    """Token keys + full-form fallback key. Used to index AND to probe."""
    keys = _block_tokens(normalized)
    if normalized:
        keys.append(_FULL_PREFIX + normalized)
    return keys


def build_contributor_index(
    contrib_names: list[str],
) -> tuple[dict[str, list[int]], list[str]]:
    """
    Build an inverted index: token → [contributor indices].
    Also returns the list of normalized contributor names (parallel to contrib_names).
    """
    normed: list[str] = []
    index: dict[str, list[int]] = defaultdict(list)

    for i, name in enumerate(contrib_names):
        n = _normalize(name)
        normed.append(n)
        for tok in _all_block_keys(n):
            index[tok].append(i)

    return index, normed


def match_principals(
    principals_df: pd.DataFrame,
    contrib_names: list[str],
    index: dict[str, list[int]],
    normed_contribs: list[str],
) -> pd.DataFrame:
    """
    For each principal, find candidate contributors via token index,
    score with token_set_ratio, return rows above MATCH_THRESHOLD.
    """
    rows = []
    total = len(principals_df)

    for i, (_, row) in enumerate(principals_df.iterrows(), 1):
        if i % 500 == 0:
            print(f"  {i:,}/{total:,} principals processed …", flush=True)

        prin_name = str(row["principal_name"])
        prin_norm = _normalize(prin_name)
        tokens = _all_block_keys(prin_norm)

        if not tokens:
            continue

        # Gather candidate indices (union across tokens + full-form key)
        candidate_set: set[int] = set()
        for tok in tokens:
            candidate_set.update(index.get(tok, []))

        if not candidate_set:
            continue

        # Score candidates
        for idx in candidate_set:
            score = fuzz.token_set_ratio(prin_norm, normed_contribs[idx])
            if score >= MATCH_THRESHOLD:
                match_type = "exact" if score == 100 else "fuzzy"
                rows.append({
                    "principal_name":   prin_name,
                    "contributor_name": contrib_names[idx],
                    "match_score":      score,
                    "match_type":       match_type,
                })

    if not rows:
        return pd.DataFrame(columns=["principal_name", "contributor_name",
                                     "match_score", "match_type"])

    result = pd.DataFrame(rows)
    # Keep best match per (principal, contributor) pair
    result = (
        result.sort_values("match_score", ascending=False)
              .drop_duplicates(subset=["principal_name", "contributor_name"])
              .reset_index(drop=True)
    )
    return result


def main(force: bool = False) -> int:
    print("=== Script 16: Match Lobbyist Principals to Contributors ===\n")

    out_path = PROCESSED_DIR / "principal_matches.csv"
    if out_path.exists() and not force:
        print(f"Skipped — {out_path.name} exists (use --force to rebuild)")
        return 0

    # Load principals
    prins_path = PROCESSED_DIR / "principals.csv"
    if not prins_path.exists():
        print("ERROR: principals.csv not found. Run 15_import_lobbyists.py first.",
              file=sys.stderr)
        return 1
    principals_df = pd.read_csv(prins_path, dtype=str).fillna("")
    print(f"Loaded {len(principals_df):,} lobbyist principals")

    # Load contributor names (prefer deduped)
    deduped_path = PROCESSED_DIR / "contributions_deduped.csv"
    raw_path     = PROCESSED_DIR / "contributions.csv"

    if deduped_path.exists():
        print(f"Loading canonical contributor names from {deduped_path.name} …", flush=True)
        name_col = "canonical_name"
        df = pd.read_csv(deduped_path, usecols=[name_col], dtype=str)
    elif raw_path.exists():
        print(f"Loading contributor names from {raw_path.name} …", flush=True)
        name_col = "contributor_name"
        df = pd.read_csv(raw_path, usecols=[name_col], dtype=str)
    else:
        print("ERROR: No contributions file found. Run import scripts first.",
              file=sys.stderr)
        return 1

    # Unique non-empty names only
    contrib_names = (
        df[name_col].dropna().str.strip()
        .loc[lambda s: s.str.len() > 0]
        .unique()
        .tolist()
    )
    print(f"Unique contributor names: {len(contrib_names):,}\n")

    print("Building inverted token index …", flush=True)
    index, normed_contribs = build_contributor_index(contrib_names)
    print(f"  Index built: {len(index):,} unique tokens\n")

    print(f"Matching principals (threshold: {MATCH_THRESHOLD}) …", flush=True)
    matches = match_principals(principals_df, contrib_names, index, normed_contribs)

    matches.to_csv(out_path, index=False)
    print(f"\n  {len(matches):,} principal↔contributor matches → {out_path.name}")

    # Summary
    exact = (matches["match_type"] == "exact").sum()
    fuzzy = (matches["match_type"] == "fuzzy").sum()
    print(f"\n=== SUMMARY ===")
    print(f"  Exact matches:  {exact:,}")
    print(f"  Fuzzy matches:  {fuzzy:,}")
    print(f"  Matched principals: {matches['principal_name'].nunique():,} / {len(principals_df):,}")
    print(f"  Matched contributors: {matches['contributor_name'].nunique():,}")

    if not matches.empty:
        print(f"\nTop 10 highest-scoring matches:")
        for _, r in matches.nlargest(10, "match_score").iterrows():
            print(f"  {int(r['match_score']):3d}  {r['principal_name'][:45]:<45}  ←→  {r['contributor_name'][:45]}")

    print("\nNext: python scripts/17_export_lobbyists.py")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
