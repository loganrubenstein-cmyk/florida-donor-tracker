# scripts/48_export_lobbyist_compensation.py
"""
Script 48: Export lobbyist compensation data to JSON.

Reads data/processed/lobbyist_compensation.csv (from script 47) and writes:
  public/data/lobbyist_comp/summary.json           overall stats
  public/data/lobbyist_comp/top_principals.json    top 200 principals by est. spend
  public/data/lobbyist_comp/top_firms.json         top 100 lobbying firms
  public/data/lobbyist_comp/by_principal/{slug}.json   per-principal detail
  public/data/lobbyist_comp/by_firm/{slug}.json        per-firm detail

Also attempts to cross-reference principal names against:
  - public/data/donors/index.json        (FL political donors)
  - public/data/principals/index.json    (FL lobbyist-registration principals)

This links the lobbying compensation world to the campaign finance world.

Usage (from project root, with .venv activated):
    python scripts/48_export_lobbyist_compensation.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

INPUT_CSV   = PROCESSED_DIR / "lobbyist_compensation.csv"
OUT_DIR     = PROJECT_ROOT / "public" / "data" / "lobbyist_comp"
BY_PRIN_DIR = OUT_DIR / "by_principal"
BY_FIRM_DIR = OUT_DIR / "by_firm"

TOP_PRINCIPALS = 200
TOP_FIRMS      = 100
TOP_DETAIL     = 20   # top firms per principal, top principals per firm

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:80]


def build_donor_lookup(data_dir: Path) -> dict[str, dict]:
    """Normalized name → donor slug for cross-referencing."""
    path = data_dir / "donors" / "index.json"
    if not path.exists():
        return {}
    donors = json.loads(path.read_text())
    return {normalize(d["name"]): d for d in donors}


def build_principal_lookup(data_dir: Path) -> dict[str, dict]:
    """Normalized name → lobbyist registration principal data."""
    path = data_dir / "principals" / "index.json"
    if not path.exists():
        return {}
    principals = json.loads(path.read_text())
    return {normalize(p["name"]): p for p in principals}


def cross_ref(name: str, donor_lkp: dict, principal_lkp: dict) -> dict:
    norm = normalize(name)
    refs = {}
    if norm in donor_lkp:
        d = donor_lkp[norm]
        refs["donor_slug"] = d.get("slug")
        refs["donor_total_combined"] = d.get("total_combined", 0)
    if norm in principal_lkp:
        p = principal_lkp[norm]
        refs["principal_slug"] = p.get("slug")
    # Partial match fallback (longer names only)
    if not refs and len(norm) > 15:
        for known, d in donor_lkp.items():
            if len(known) > 10 and (known in norm or norm in known):
                refs["donor_slug"] = d.get("slug")
                refs["donor_total_combined"] = d.get("total_combined", 0)
                refs["donor_match_type"] = "partial"
                break
    return refs


def main() -> int:
    print("=== Script 48: Export Lobbyist Compensation ===\n")

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found. Run script 47 first.")
        return 1

    print(f"Reading {INPUT_CSV} ...", flush=True)
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    df["comp_midpoint"] = pd.to_numeric(df["comp_midpoint"], errors="coerce").fillna(0)
    df["firm_name"]      = df["firm_name"].fillna("").astype(str).str.strip()
    df["principal_name"] = df["principal_name"].fillna("").astype(str).str.strip()
    df = df[df["principal_name"] != ""].copy()
    print(f"  {len(df):,} records, {df['principal_name'].nunique():,} principals, {df['firm_name'].nunique():,} firms")

    data_dir = PROJECT_ROOT / "public" / "data"
    print("Building cross-reference lookups ...", flush=True)
    donor_lkp     = build_donor_lookup(data_dir)
    principal_lkp = build_principal_lookup(data_dir)
    print(f"  {len(donor_lkp):,} donors, {len(principal_lkp):,} lobbyist-reg principals")

    # --- Summary ---
    by_quarter = (
        df.groupby(["year", "quarter", "quarter_label", "branch"])
        .agg(total_comp=("comp_midpoint", "sum"), num_records=("comp_midpoint", "size"),
             num_principals=("principal_name", "nunique"), num_firms=("firm_name", "nunique"))
        .reset_index()
        .sort_values(["year", "quarter", "branch"])
    )
    summary = {
        "total_estimated_comp": int(df["comp_midpoint"].sum()),
        "total_records":        int(len(df)),
        "num_principals":       int(df["principal_name"].nunique()),
        "num_firms":            int(df["firm_name"].nunique()),
        "note":                 "Compensation figures are midpoints of FL-mandated ranges, not exact amounts.",
        "by_quarter": [
            {"year": int(r.year), "quarter": int(r.quarter), "period": r.quarter_label,
             "branch": r.branch, "total_comp": int(r.total_comp),
             "num_principals": int(r.num_principals), "num_firms": int(r.num_firms)}
            for r in by_quarter.itertuples(index=False)
        ],
        "generated_by": "scripts/48_export_lobbyist_compensation.py",
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary.json (${summary['total_estimated_comp']:,.0f} est. total)")

    # --- Top principals ---
    print("Building top principals ...", flush=True)
    top_prin = (
        df.groupby("principal_name")
        .agg(total_comp=("comp_midpoint", "sum"), num_records=("comp_midpoint", "size"),
             num_firms=("firm_name", "nunique"), num_quarters=("quarter", "nunique"),
             branches=("branch", lambda x: sorted(x.unique().tolist())))
        .reset_index()
        .sort_values("total_comp", ascending=False)
        .head(TOP_PRINCIPALS)
    )
    top_prin_list = []
    for row in top_prin.itertuples(index=False):
        entry = {
            "principal_name":    row.principal_name,
            "slug":              slugify(row.principal_name),
            "total_comp":        int(row.total_comp),
            "num_records":       int(row.num_records),
            "num_firms":         int(row.num_firms),
            "num_quarters":      int(row.num_quarters),
            "branches":          row.branches,
            **cross_ref(row.principal_name, donor_lkp, principal_lkp),
        }
        top_prin_list.append(entry)
    (OUT_DIR / "top_principals.json").write_text(json.dumps(top_prin_list, separators=(",", ":")))
    cross_linked = sum(1 for e in top_prin_list if e.get("donor_slug") or e.get("principal_slug"))
    print(f"  wrote top_principals.json ({len(top_prin_list)} principals, {cross_linked} cross-linked to campaign finance)")

    # --- Top firms ---
    print("Building top firms ...", flush=True)
    top_firms = (
        df.groupby("firm_name")
        .agg(total_comp=("comp_midpoint", "sum"), num_records=("comp_midpoint", "size"),
             num_principals=("principal_name", "nunique"), num_quarters=("quarter", "nunique"))
        .reset_index()
        .sort_values("total_comp", ascending=False)
        .head(TOP_FIRMS)
    )
    top_firms_list = [
        {"firm_name": r.firm_name, "slug": slugify(r.firm_name),
         "total_comp": int(r.total_comp), "num_principals": int(r.num_principals),
         "num_quarters": int(r.num_quarters)}
        for r in top_firms.itertuples(index=False)
    ]
    (OUT_DIR / "top_firms.json").write_text(json.dumps(top_firms_list, separators=(",", ":")))
    print(f"  wrote top_firms.json ({len(top_firms_list)} firms)")

    # --- Per-principal detail pages ---
    BY_PRIN_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Writing per-principal JSONs ...", flush=True)
    num_prin_files = 0
    for principal_name, pdf in df.groupby("principal_name"):
        total_comp  = int(pdf["comp_midpoint"].sum())
        top_firms_p = (
            pdf.groupby("firm_name")["comp_midpoint"].sum()
            .sort_values(ascending=False).head(TOP_DETAIL)
        )
        by_quarter_p = (
            pdf.groupby(["year", "quarter", "quarter_label", "branch"])["comp_midpoint"].sum()
            .reset_index().sort_values(["year", "quarter"])
        )
        slug = slugify(principal_name)
        if not slug:
            continue
        payload = {
            "principal_name": principal_name,
            "slug":           slug,
            "total_comp":     total_comp,
            "num_quarters":   int(pdf["quarter"].nunique()),
            "branches":       sorted(pdf["branch"].unique().tolist()),
            "top_firms": [
                {"firm_name": fn, "slug": slugify(fn), "total_comp": int(amt)}
                for fn, amt in top_firms_p.items()
            ],
            "by_quarter": [
                {"year": int(r.year), "quarter": int(r.quarter),
                 "period": r.quarter_label, "branch": r.branch,
                 "total_comp": int(r.comp_midpoint)}
                for r in by_quarter_p.itertuples(index=False)
            ],
            **cross_ref(principal_name, donor_lkp, principal_lkp),
        }
        (BY_PRIN_DIR / f"{slug}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        )
        num_prin_files += 1
    print(f"  wrote {num_prin_files:,} principal files")

    # --- Per-firm detail pages ---
    BY_FIRM_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Writing per-firm JSONs ...", flush=True)
    num_firm_files = 0
    for firm_name, fdf in df.groupby("firm_name"):
        total_comp    = int(fdf["comp_midpoint"].sum())
        top_clients   = (
            fdf.groupby("principal_name")["comp_midpoint"].sum()
            .sort_values(ascending=False).head(TOP_DETAIL)
        )
        by_quarter_f  = (
            fdf.groupby(["year", "quarter", "quarter_label", "branch"])["comp_midpoint"].sum()
            .reset_index().sort_values(["year", "quarter"])
        )
        slug = slugify(firm_name)
        if not slug:
            continue
        payload = {
            "firm_name":      firm_name,
            "slug":           slug,
            "total_comp":     total_comp,
            "num_principals": int(fdf["principal_name"].nunique()),
            "num_quarters":   int(fdf["quarter"].nunique()),
            "top_clients": [
                {"principal_name": pn, "slug": slugify(pn), "total_comp": int(amt),
                 **cross_ref(pn, donor_lkp, principal_lkp)}
                for pn, amt in top_clients.items()
            ],
            "by_quarter": [
                {"year": int(r.year), "quarter": int(r.quarter),
                 "period": r.quarter_label, "branch": r.branch,
                 "total_comp": int(r.comp_midpoint)}
                for r in by_quarter_f.itertuples(index=False)
            ],
        }
        (BY_FIRM_DIR / f"{slug}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        )
        num_firm_files += 1
    print(f"  wrote {num_firm_files:,} firm files")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
