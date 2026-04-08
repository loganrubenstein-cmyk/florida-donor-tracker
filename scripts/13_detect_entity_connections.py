# scripts/13_detect_entity_connections.py
"""
Script 13: Detect connected political entities.

Finds committees that share structural DNA — same treasurer, address, phone,
or overlapping donor pools — and scores the strength of each connection.

This reveals "front groups" and coordinated operations that pretend to be
independent but are actually controlled by the same people.

Signals used (with weights):
  shared_treasurer : 30   — same person files both committees' reports
  shared_address   : 20   — same physical location
  shared_phone     : 15   — same contact number
  shared_chair     : 10   — same chairperson
  donor_overlap    : 15   — >50% of top donors give to both (scaled)
  money_between    : 10   — direct fund transfers between them

Threshold: connection_score >= 25 is flagged.

Outputs:
  public/data/entity_connections.json — scored pairs, sorted by connection_score

Usage (from project root, with .venv activated):
    python scripts/13_detect_entity_connections.py
    python scripts/13_detect_entity_connections.py --force
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

PUBLIC_DIR      = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR  = PUBLIC_DIR / "committees"
OUTPUT_FILE     = PUBLIC_DIR / "entity_connections.json"          # top 500 (website)
FULL_FILE       = PUBLIC_DIR / "entity_connections_full.json"     # all connections (analysis)

# Minimum score to include a pair in the full output
SCORE_THRESHOLD = 25
# Only top N connections go into the trimmed website file
WEBSITE_TOP_N = 500

# Scoring weights
W_TREASURER   = 30
W_ADDRESS     = 20
W_PHONE       = 15
W_CHAIR       = 10
W_DONOR_OVL   = 15   # full weight if overlap >= 50%; scaled below that
W_MONEY_BTWN  = 10


# ---------------------------------------------------------------------------
# Name and address normalization
# ---------------------------------------------------------------------------

def _norm_name(last: str, first: str, middle: str = "") -> str:
    """Combine and normalize a person's name components."""
    parts = [str(x).strip().upper() for x in [last, first] if str(x).strip() not in ("", "nan")]
    if parts:
        return " ".join(parts)
    return ""


def _norm_addr(addr1: str, city: str) -> str:
    """Normalize an address for matching."""
    a = str(addr1).strip().upper()
    c = str(city).strip().upper()
    if a and a != "NAN" and c and c != "NAN":
        return f"{a}|{c}"
    return ""


def _norm_phone(phone: str) -> str:
    """Strip non-digits from phone number for matching."""
    digits = "".join(c for c in str(phone) if c.isdigit())
    return digits if len(digits) >= 7 else ""


# ---------------------------------------------------------------------------
# Group-based pair discovery — only examine pairs that share at least one field
# ---------------------------------------------------------------------------

def find_candidate_pairs(committees_df: pd.DataFrame) -> dict:
    """
    Return a dict of {(acct_a, acct_b): {shared_fields}} for all pairs
    that share at least one structural attribute.

    acct_a < acct_b always (canonical ordering to avoid duplicates).
    """
    df = committees_df.copy()
    df["_treasurer"] = df.apply(
        lambda r: _norm_name(r.get("treasurer_last", ""), r.get("treasurer_first", ""),
                             r.get("treasurer_middle", "")), axis=1)
    df["_chair"] = df.apply(
        lambda r: _norm_name(r.get("chair_last", ""), r.get("chair_first", ""),
                             r.get("chair_middle", "")), axis=1)
    df["_addr"] = df.apply(
        lambda r: _norm_addr(r.get("addr1", ""), r.get("city", "")), axis=1)
    df["_phone"] = df["phone"].apply(_norm_phone) if "phone" in df.columns else ""

    pairs: dict = {}  # (a, b) → set of shared fields

    def _add_pairs(col: str, field_name: str, min_len: int = 3):
        grouped = df[df[col].str.len() >= min_len].groupby(col)["acct_num"].apply(list)
        for val, accts in grouped.items():
            if len(accts) < 2:
                continue
            for i in range(len(accts)):
                for j in range(i + 1, len(accts)):
                    key = (min(accts[i], accts[j]), max(accts[i], accts[j]))
                    pairs.setdefault(key, set()).add(field_name)

    _add_pairs("_treasurer", "treasurer")
    _add_pairs("_chair",     "chair")
    _add_pairs("_addr",      "address",   min_len=5)
    _add_pairs("_phone",     "phone",     min_len=7)

    return pairs


# ---------------------------------------------------------------------------
# Donor overlap computation
# ---------------------------------------------------------------------------

def build_top_donor_sets(
    contribs_df: pd.DataFrame,
    acct_nums: set,
    top_n: int = 25,
) -> dict:
    """
    For each acct_num, return the set of top_n canonical donor names.
    Only builds sets for accts in acct_nums (the ones we actually need).
    """
    col = "canonical_name" if "canonical_name" in contribs_df.columns else "contributor_name"
    donor_sets: dict = {}

    relevant = contribs_df[contribs_df["source_file"].str.contains(
        "|".join(f"Contrib_{a.replace(' ', '_')}" for a in acct_nums), regex=True
    )] if acct_nums else contribs_df

    for sf in relevant["source_file"].dropna().unique():
        stem = Path(sf).stem
        if not stem.startswith("Contrib_"):
            continue
        acct = stem[len("Contrib_"):].replace("_", " ")
        if acct not in acct_nums:
            continue
        subset = relevant[relevant["source_file"] == sf]
        top = (
            subset.groupby(col)["amount"]
            .sum()
            .sort_values(ascending=False)
            .head(top_n)
            .index
        )
        donor_sets[acct] = set(top)

    return donor_sets


def donor_overlap_pct(set_a: set, set_b: set) -> float:
    """Jaccard-style overlap: |A ∩ B| / |A ∪ B|, returned as 0–100."""
    if not set_a or not set_b:
        return 0.0
    union = set_a | set_b
    inter = set_a & set_b
    return round(100.0 * len(inter) / len(union), 1)


# ---------------------------------------------------------------------------
# Transfer lookup
# ---------------------------------------------------------------------------

def build_transfer_lookup(transfers_df: pd.DataFrame, committees_df: pd.DataFrame) -> dict:
    """
    Return {(acct_a, acct_b): total_transferred} for all pairs where money
    flowed in either direction. Canonical ordering: acct_a < acct_b.
    """
    if transfers_df is None or transfers_df.empty:
        return {}

    name_to_acct = {}
    for _, row in committees_df.iterrows():
        acct = str(row.get("acct_num", "")).strip()
        name = str(row.get("committee_name", "")).strip().upper()
        if acct and name:
            name_to_acct[name] = acct

    tdf = transfers_df.copy()
    tdf["from_acct"] = tdf["transferor_name"].str.strip().str.upper().map(name_to_acct)
    tdf["to_acct"]   = tdf["transferee_name"].str.strip().str.upper().map(name_to_acct)

    lookup: dict = {}
    matched = tdf[tdf["from_acct"].notna() & tdf["to_acct"].notna()]
    for _, row in matched.iterrows():
        key = (min(row["from_acct"], row["to_acct"]),
               max(row["from_acct"], row["to_acct"]))
        lookup[key] = lookup.get(key, 0.0) + float(row["amount"])

    return lookup


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------

def score_pair(shared_fields: set, overlap_pct: float, money_between: float) -> int:
    score = 0
    if "treasurer" in shared_fields:
        score += W_TREASURER
    if "address" in shared_fields:
        score += W_ADDRESS
    if "phone" in shared_fields:
        score += W_PHONE
    if "chair" in shared_fields:
        score += W_CHAIR
    if overlap_pct > 0:
        # Scale: full W_DONOR_OVL at 50%+ overlap, proportional below
        score += int(W_DONOR_OVL * min(overlap_pct / 50.0, 1.0))
    if money_between > 0:
        score += W_MONEY_BTWN
    return score


# ---------------------------------------------------------------------------
# Per-committee connection files
# ---------------------------------------------------------------------------

def write_per_committee_files(connections: list) -> int:
    """
    Write public/data/committees/{acct}.connections.json for every committee
    that appears in at least one scored connection.

    Each file lists all connections for that committee, with the counterpart
    entity's info and the connection details, sorted by score descending.
    Returns the number of files written.
    """
    COMMITTEES_DIR.mkdir(parents=True, exist_ok=True)

    # Build acct → [connection entries] index
    index: dict = {}
    for conn in connections:
        a = conn["entity_a"]
        b = conn["entity_b"]
        detail = {
            "connection_score":  conn["connection_score"],
            "shared_treasurer":  conn["shared_treasurer"],
            "shared_address":    conn["shared_address"],
            "shared_phone":      conn["shared_phone"],
            "shared_chair":      conn["shared_chair"],
            "donor_overlap_pct": conn["donor_overlap_pct"],
            "money_between":     conn["money_between"],
        }
        # From entity_a's perspective, the counterpart is entity_b
        index.setdefault(a["acct_num"], []).append({**b, **detail})
        # From entity_b's perspective, the counterpart is entity_a
        index.setdefault(b["acct_num"], []).append({**a, **detail})

    count = 0
    for acct, entries in index.items():
        entries.sort(key=lambda x: x["connection_score"], reverse=True)
        out = {
            "acct_num": acct,
            "total_connections": len(entries),
            "connections": entries,
        }
        path = COMMITTEES_DIR / f"{acct}.connections.json"
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
        count += 1

    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(force: bool = False) -> int:
    print("=== Script 13: Detect Entity Connections ===\n")

    if OUTPUT_FILE.exists() and not force:
        print(f"Skipped — {OUTPUT_FILE} already exists (use --force to rebuild)")
        return 0

    # Load committees
    committees_path = PROCESSED_DIR / "committees.csv"
    if not committees_path.exists():
        print("ERROR: committees.csv not found. Run 05_import_registry.py first.",
              file=sys.stderr)
        return 1
    committees_df = pd.read_csv(committees_path, dtype=str).fillna("")
    print(f"Loaded {len(committees_df):,} committees")

    # Load contributions (for donor overlap)
    deduped = PROCESSED_DIR / "contributions_deduped.csv"
    raw_csv = PROCESSED_DIR / "contributions.csv"
    contribs_df = None
    if deduped.exists():
        print(f"Loading {deduped.name} for donor overlap ...", flush=True)
        contribs_df = pd.read_csv(deduped, dtype=str, low_memory=False)
        contribs_df["amount"] = pd.to_numeric(contribs_df["amount"], errors="coerce").fillna(0.0)
    elif raw_csv.exists():
        print(f"Loading {raw_csv.name} for donor overlap (not deduplicated) ...", flush=True)
        contribs_df = pd.read_csv(raw_csv, dtype=str, low_memory=False)
        contribs_df["amount"] = pd.to_numeric(contribs_df["amount"], errors="coerce").fillna(0.0)
    else:
        print("WARNING: No contributions data found — donor overlap will be skipped.")

    # Load transfers (optional)
    transfers_path = PROCESSED_DIR / "transfers.csv"
    transfers_df = None
    if transfers_path.exists():
        print("Loading transfers.csv for money-between detection ...", flush=True)
        transfers_df = pd.read_csv(transfers_path, dtype=str, low_memory=False)
        transfers_df["amount"] = pd.to_numeric(transfers_df["amount"], errors="coerce").fillna(0.0)
    else:
        print("transfers.csv not found — money-between will be skipped (run scripts 11+12)")

    # Find candidate pairs via structural attributes
    print("\nFinding candidate pairs via shared attributes ...", flush=True)
    pairs = find_candidate_pairs(committees_df)
    print(f"  {len(pairs):,} candidate pairs found")

    # Add transfer-based pairs
    transfer_lookup = build_transfer_lookup(transfers_df, committees_df)
    for key in transfer_lookup:
        pairs.setdefault(key, set()).add("transfers")

    print(f"  {len(pairs):,} pairs after adding transfer connections")

    # Build donor sets only for committees that appear in candidate pairs
    involved_accts = set()
    for a, b in pairs:
        involved_accts.add(a)
        involved_accts.add(b)
    print(f"  Computing donor overlap for {len(involved_accts):,} committees ...", flush=True)

    donor_sets: dict = {}
    if contribs_df is not None and not contribs_df.empty:
        donor_sets = build_top_donor_sets(contribs_df, involved_accts)

    # Score pairs and filter
    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()
    acct_to_type = committees_df.set_index("acct_num")["type_code"].to_dict()

    connections = []
    for (acct_a, acct_b), shared_fields in pairs.items():
        overlap = donor_overlap_pct(
            donor_sets.get(acct_a, set()),
            donor_sets.get(acct_b, set()),
        )
        money = transfer_lookup.get((acct_a, acct_b), 0.0)
        score = score_pair(shared_fields, overlap, money)

        if score < SCORE_THRESHOLD:
            continue

        connections.append({
            "entity_a": {
                "acct_num": acct_a,
                "name": acct_to_name.get(acct_a, acct_a),
                "type_code": acct_to_type.get(acct_a, ""),
            },
            "entity_b": {
                "acct_num": acct_b,
                "name": acct_to_name.get(acct_b, acct_b),
                "type_code": acct_to_type.get(acct_b, ""),
            },
            "connection_score": score,
            "shared_treasurer": "treasurer" in shared_fields,
            "shared_address":   "address"   in shared_fields,
            "shared_phone":     "phone"     in shared_fields,
            "shared_chair":     "chair"     in shared_fields,
            "donor_overlap_pct": overlap,
            "money_between": round(money, 2),
        })

    connections.sort(key=lambda x: x["connection_score"], reverse=True)
    print(f"\nConnections above threshold ({SCORE_THRESHOLD}): {len(connections):,}")

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "threshold": SCORE_THRESHOLD,
        "total_connections": len(connections),
        "weights": {
            "shared_treasurer": W_TREASURER,
            "shared_address": W_ADDRESS,
            "shared_phone": W_PHONE,
            "shared_chair": W_CHAIR,
            "donor_overlap_max": W_DONOR_OVL,
            "money_between": W_MONEY_BTWN,
        },
    }

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    # Full output (for data analysis / download)
    full_output = {**meta, "connections": connections}
    FULL_FILE.write_text(json.dumps(full_output, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(connections):,} connections → {FULL_FILE} (full)")

    # Trimmed website file — top N by score
    trimmed = connections[:WEBSITE_TOP_N]
    website_output = {**meta, "total_connections": len(connections),
                      "shown": len(trimmed), "connections": trimmed}
    OUTPUT_FILE.write_text(json.dumps(website_output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote top {len(trimmed):,} connections → {OUTPUT_FILE} (website)")

    # Per-committee connection files
    print("Writing per-committee connection files ...", flush=True)
    written = write_per_committee_files(connections)
    print(f"  Wrote {written:,} files → {COMMITTEES_DIR}/*.connections.json")

    if connections:
        print("\nTop 10 most connected pairs:")
        for c in connections[:10]:
            print(f"  score={c['connection_score']:3d}  "
                  f"{c['entity_a']['name'][:40]}  ←→  {c['entity_b']['name'][:40]}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
