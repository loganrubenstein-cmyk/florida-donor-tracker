# scripts/45_enrich_vendor_committee_links.py
"""
Script 45: Enrich top_vendors.json with committee cross-reference links.

Some of the largest recipients of committee expenditure money are themselves
FL political committees (e.g. "REPUBLICAN PARTY OF FLORIDA" appears as both a
committee and a top vendor). This script matches vendor names in top_vendors.json
against the committee index and adds a `committee_acct_num` field where found.

Also enriches public/data/ie/top_spenders.json — committee profiles already
have acct_nums but confirms committee_name for the frontend.

Updates (in place):
  - public/data/expenditures/top_vendors.json     → adds committee_acct_num field
  - public/data/expenditures/top_vendors_all.json → same, if exists

Usage (from project root, with .venv activated):
    python scripts/45_enrich_vendor_committee_links.py
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR     = PROJECT_ROOT / "public" / "data"

COMMITTEE_INDEX = DATA_DIR / "committees" / "index.json"
TOP_VENDORS_FILES = [
    DATA_DIR / "expenditures" / "top_vendors.json",
    DATA_DIR / "expenditures" / "top_vendors_all.json",
]

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")
_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PA|PLLC|PC)\.?$",
    re.IGNORECASE,
)


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    for _ in range(2):
        new = _SUFFIX_RE.sub("", s).strip()
        if new == s:
            break
        s = new
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def build_lookup(index: list[dict]) -> dict[str, dict]:
    """Normalized committee name → {acct_num, committee_name}."""
    lookup: dict[str, dict] = {}
    for c in index:
        norm = normalize(c.get("committee_name", ""))
        if norm:
            lookup[norm] = {
                "acct_num":       str(c["acct_num"]),
                "committee_name": c["committee_name"],
            }
    return lookup


def match_vendor(vendor_norm: str, lookup: dict) -> dict | None:
    # Exact normalized match
    if vendor_norm in lookup:
        return lookup[vendor_norm]
    # Substring match (both directions) for long names (≥12 chars)
    if len(vendor_norm) >= 12:
        for known_norm, info in lookup.items():
            if len(known_norm) >= 12 and (
                known_norm in vendor_norm or vendor_norm in known_norm
            ):
                return info
    return None


def enrich_file(path: Path, lookup: dict) -> None:
    if not path.exists():
        print(f"  Skipping {path.name} (not found)")
        return

    vendors = json.loads(path.read_text())
    matched = 0
    for v in vendors:
        norm = v.get("vendor_name_normalized", normalize(v.get("vendor_name", "")))
        hit  = match_vendor(norm, lookup)
        if hit:
            v["committee_acct_num"] = hit["acct_num"]
            matched += 1
        else:
            v["committee_acct_num"] = None

    path.write_text(json.dumps(vendors, separators=(",", ":")))
    print(f"  {path.name}: {matched}/{len(vendors)} vendors linked to committees")


def main() -> int:
    print("=== Script 45: Enrich Vendor → Committee Links ===\n")

    if not COMMITTEE_INDEX.exists():
        print(f"ERROR: {COMMITTEE_INDEX} not found.")
        return 1

    index = json.loads(COMMITTEE_INDEX.read_text())
    lookup = build_lookup(index)
    print(f"Built lookup from {len(lookup):,} committee names")

    for path in TOP_VENDORS_FILES:
        enrich_file(path, lookup)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
