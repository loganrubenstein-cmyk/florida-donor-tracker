# scripts/46_match_ie_candidates.py
"""
Script 46: Match IE candidate name hints to actual candidate acct_nums.

The purpose field in IE/EC expenditure rows contains free-text candidate name
references (e.g., "FOR FRANK CAROLLO SIGNS", "MANOLO REYES MIAMI DI 4").
Script 44 extracted these as candidate_hint strings.

This script loads public/data/ie/by_candidate_targeted.json and tries to
match each hint against candidate_stats.json using:
  1. Exact normalized last-name match
  2. Full normalized name substring match

Updates public/data/ie/by_candidate_targeted.json in place with added fields:
  candidate_acct_num (str|null), candidate_name_matched (str|null), match_type (str|null)

Also builds public/data/ie/by_candidate/{acct_num}.json — per-candidate IE summary,
linking IE spending back to candidate profile pages.

Usage (from project root, with .venv activated):
    python scripts/46_match_ie_candidates.py
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR     = PROJECT_ROOT / "public" / "data"

IE_TARGETS_FILE  = DATA_DIR / "ie" / "by_candidate_targeted.json"
IE_BY_CAND_DIR   = DATA_DIR / "ie" / "by_candidate"
CANDIDATE_STATS  = DATA_DIR / "candidate_stats.json"
EXPENDITURES_CSV = PROJECT_ROOT / "data" / "processed" / "expenditures.csv"

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")

IE_TYPES = {"IEC", "IEI", "ECC", "ECI"}
_ACCT_RE = re.compile(r"Expend_(\d+)\.txt", re.IGNORECASE)


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def build_candidate_lookup(stats: list[dict]) -> tuple[dict, dict]:
    """
    Returns (last_name_lookup, full_name_lookup).
    last_name_lookup: normalized last name → list of candidate dicts
    full_name_lookup: normalized full name → candidate dict
    """
    last_name: dict[str, list[dict]] = {}
    full_name: dict[str, dict] = {}

    for c in stats:
        raw = c.get("candidate_name", "")
        norm_full = normalize(raw)
        full_name[norm_full] = c

        # Last name = last word(s) before any comma or end
        parts = raw.split(",")
        ln = normalize(parts[0].strip().split()[-1] if parts[0].strip() else "")
        if ln and len(ln) > 3:
            last_name.setdefault(ln, []).append(c)

    return last_name, full_name


def match_hint(hint: str, last_name_lookup: dict, full_name_lookup: dict) -> dict | None:
    norm = normalize(hint)

    # 1. Full-name substring match
    for full_norm, cand in full_name_lookup.items():
        if len(full_norm) > 5 and full_norm in norm:
            return {"cand": cand, "match_type": "full_name_substr"}

    # 2. Last-name exact match (only if unique)
    words = norm.split()
    for word in words:
        if len(word) > 4 and word in last_name_lookup:
            matches = last_name_lookup[word]
            if len(matches) == 1:
                return {"cand": matches[0], "match_type": "last_name_unique"}

    return None


def main() -> int:
    print("=== Script 46: Match IE Candidates ===\n")

    if not IE_TARGETS_FILE.exists():
        print(f"ERROR: {IE_TARGETS_FILE} not found. Run script 44 first.")
        return 1
    if not CANDIDATE_STATS.exists():
        print(f"ERROR: {CANDIDATE_STATS} not found.")
        return 1

    targets = json.loads(IE_TARGETS_FILE.read_text())
    stats   = json.loads(CANDIDATE_STATS.read_text())
    last_name_lookup, full_name_lookup = build_candidate_lookup(stats)

    print(f"Matching {len(targets)} hint entries against {len(stats):,} candidates ...")

    matched = 0
    for entry in targets:
        hint   = entry.get("candidate_name_hint", "")
        result = match_hint(hint, last_name_lookup, full_name_lookup)
        if result:
            cand = result["cand"]
            entry["candidate_acct_num"]    = str(cand["acct_num"])
            entry["candidate_name_matched"] = cand["candidate_name"]
            entry["match_type"]             = result["match_type"]
            matched += 1
        else:
            entry["candidate_acct_num"]    = None
            entry["candidate_name_matched"] = None
            entry["match_type"]             = None

    IE_TARGETS_FILE.write_text(json.dumps(targets, indent=2, ensure_ascii=False))
    print(f"Matched {matched}/{len(targets)} hints to candidate acct_nums")

    # Print sample matches
    print("\nSample matches:")
    for e in [t for t in targets if t.get("candidate_acct_num")][:8]:
        print(f"  {e['candidate_name_hint'][:40]:40} → {e['candidate_name_matched']} ({e['candidate_acct_num']}) [{e['match_type']}]")

    # --- Per-candidate IE summaries ---
    # Load full expenditures to aggregate IE spending per matched candidate
    print("\nBuilding per-candidate IE files ...", flush=True)
    try:
        import pandas as pd
        df = pd.read_csv(EXPENDITURES_CSV, low_memory=False)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        df["expenditure_date"] = pd.to_datetime(df["expenditure_date"], errors="coerce")
        ie_df = df[df["type_code"].isin(IE_TYPES)].copy()
        ie_df["acct_num"] = ie_df["source_file"].apply(
            lambda s: (m := _ACCT_RE.search(str(s))) and m.group(1)
        )
        ie_df["year"] = ie_df["expenditure_date"].dt.year

        # For each matched candidate, pull all IE rows whose purpose mentions their name
        IE_BY_CAND_DIR.mkdir(parents=True, exist_ok=True)
        cand_files = 0
        for entry in targets:
            acct = entry.get("candidate_acct_num")
            if not acct:
                continue
            cand_name = entry.get("candidate_name_matched", "")
            if not cand_name:
                continue
            # Search by matched candidate's last name (more reliable than noisy hint)
            last_name = cand_name.split(",")[0].strip().split()[-1].upper()
            mask = ie_df["purpose"].str.upper().str.contains(
                last_name, na=False, regex=False
            )
            cdf = ie_df[mask]
            if cdf.empty:
                continue

            payload = {
                "candidate_acct_num":  acct,
                "candidate_name":      cand_name,
                "total_ie_amount":     round(float(cdf["amount"].sum()), 2),
                "num_expenditures":    int(len(cdf)),
                "num_committees":      int(cdf["acct_num"].nunique()),
                "by_year": [
                    {"year": int(y), "amount": round(float(a), 2)}
                    for y, a in cdf.groupby("year")["amount"].sum().sort_index().items()
                    if not pd.isna(y)
                ],
                "spending_committees": [
                    {"acct_num": str(a), "amount": round(float(s), 2)}
                    for a, s in cdf.groupby("acct_num")["amount"].sum()
                                    .sort_values(ascending=False).head(10).items()
                ],
            }
            (IE_BY_CAND_DIR / f"{acct}.json").write_text(
                json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
            )
            cand_files += 1
        print(f"  wrote {cand_files} per-candidate IE files to ie/by_candidate/")
    except Exception as e:
        print(f"  WARNING: could not build per-candidate files: {e}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
