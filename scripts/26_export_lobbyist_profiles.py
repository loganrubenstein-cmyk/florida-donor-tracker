# scripts/26_export_lobbyist_profiles.py
"""
Script 26: Export per-lobbyist JSON profiles for the public website.

Reads lobbyists.csv, lobbyist_registrations.csv, principals.csv, and
principal_matches.csv to build a full lobbyist directory and individual
profile pages.

Outputs
-------
  public/data/lobbyists/index.json
      Lightweight index for the directory page.
      [{slug, name, firm, city, state, num_principals, num_active,
        top_principal, has_donation_match}]

  public/data/lobbyists/{slug}.json
      Full lobbyist profile:
        slug, name, firm, city, state, phone,
        principals: [{name, is_active, branch, since, until, donation_total,
                      num_contributions, num_lobbyists_for_principal}],
        total_donation_influence: sum of donation_total across matched principals

  public/data/principals/index.json
      Index of all lobbying principals.
      [{slug, name, naics, city, state, total_lobbyists, donation_total,
        num_contributions, num_lobbyists_active}]

  public/data/principals/{slug}.json
      Full principal profile:
        slug, name, naics, city, state,
        lobbyists: [{name, slug, firm, branch, is_active, since}],
        donation_matches: [{contributor_name, match_score, total_donated,
                            num_contributions, committees: [acct_num]}]

Usage:
    python scripts/26_export_lobbyist_profiles.py
    python scripts/26_export_lobbyist_profiles.py --force
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

PUBLIC_DIR       = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR   = PUBLIC_DIR / "committees"
LOB_OUT_DIR      = PUBLIC_DIR / "lobbyists"
PRI_OUT_DIR      = PUBLIC_DIR / "principals"
LOB_INDEX        = LOB_OUT_DIR / "index.json"
PRI_INDEX        = PRI_OUT_DIR / "index.json"

LOBBYISTS_CSV    = PROCESSED_DIR / "lobbyists.csv"
REG_CSV          = PROCESSED_DIR / "lobbyist_registrations.csv"
PRINCIPALS_CSV   = PROCESSED_DIR / "principals.csv"
PRINCIPAL_MATCH  = PROCESSED_DIR / "principal_matches.csv"


def slugify(name) -> str:
    if not name:
        return ""
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s[:120]


def write_json(data, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


# ── Load data ─────────────────────────────────────────────────────────────────

def load_data():
    lob = pd.read_csv(LOBBYISTS_CSV, dtype=str).fillna("")
    reg = pd.read_csv(REG_CSV, dtype=str).fillna("")
    pri = pd.read_csv(PRINCIPALS_CSV, dtype=str).fillna("")
    match = pd.read_csv(PRINCIPAL_MATCH, dtype=str)
    match["match_score"] = pd.to_numeric(match["match_score"], errors="coerce")
    return lob, reg, pri, match


def load_sidecar_donations() -> dict:
    """
    Read all committee lobbyist sidecar files and build:
      {principal_name: {total_donated, num_contributions, committees: [acct_num]}}
    """
    out = defaultdict(lambda: {"total_donated": 0.0, "num_contributions": 0, "committees": []})
    for path in COMMITTEES_DIR.glob("*.lobbyists.json"):
        try:
            data = json.loads(path.read_text())
            acct = data.get("acct_num", path.stem.split(".")[0])
            for alert in data.get("connection_alerts", []):
                pname = alert.get("principal_name", "")
                if pname:
                    out[pname]["total_donated"] += float(alert.get("total_donated", 0))
                    out[pname]["num_contributions"] += int(alert.get("num_contributions", 0))
                    if acct not in out[pname]["committees"]:
                        out[pname]["committees"].append(acct)
        except Exception:
            continue
    return dict(out)


# ── Build lobbyist profiles ───────────────────────────────────────────────────

def build_lobbyist_data(lob, reg, sidecar_by_principal):
    """
    Returns (index_rows, profiles).
    """
    # Map principal_name → donation info from sidecars
    # Registrations: lobbyist_name → list of {principal, firm, branch, is_active, since, until}
    reg_by_lobbyist = defaultdict(list)
    for _, row in reg.iterrows():
        lname = str(row["lobbyist_name"]).strip().upper()
        is_active = str(row.get("is_active", "")).lower() in ("true", "1", "yes")
        reg_by_lobbyist[lname].append({
            "principal_name": str(row["principal_name"]).strip(),
            "firm":           str(row.get("firm_name", "")).strip(),
            "branch":         str(row.get("branch", "")).strip(),
            "is_active":      is_active,
            "since":          str(row.get("reg_eff_date", "")).strip(),
            "until":          str(row.get("reg_wd_date", "")).strip(),
        })

    index_rows = []
    profiles = {}

    for _, row in lob.iterrows():
        name = str(row["lobbyist_name"]).strip().upper()
        if not name or name.startswith("LOBBYIST"):  # skip test rows
            continue

        slug = slugify(name)
        firm  = str(row.get("firm_name", "") or "").strip()
        city  = str(row.get("city", "") or "").strip()
        state = str(row.get("state", "") or "").strip()
        phone = str(row.get("phone", "") or "").strip()

        regs = reg_by_lobbyist.get(name, [])
        num_active = sum(1 for r in regs if r["is_active"])

        # Build principal list with donation data attached
        principal_list = []
        total_influence = 0.0
        has_donation_match = False

        for r in sorted(regs, key=lambda x: (not x["is_active"], x["principal_name"])):
            pname = r["principal_name"]
            don = sidecar_by_principal.get(pname, {})
            donated = float(don.get("total_donated", 0))
            if donated > 0:
                has_donation_match = True
                total_influence += donated
            principal_list.append({
                "name":              pname,
                "is_active":         r["is_active"],
                "branch":            r["branch"],
                "firm":              r["firm"],
                "since":             r["since"],
                "until":             r["until"] or None,
                "donation_total":    round(donated, 2),
                "num_contributions": don.get("num_contributions", 0),
                "committees":        don.get("committees", []),
            })

        top_principal = regs[0]["principal_name"] if regs else None

        index_rows.append({
            "slug":            slug,
            "name":            name,
            "firm":            firm,
            "city":            city,
            "state":           state,
            "num_principals":  len(regs),
            "num_active":      num_active,
            "top_principal":   top_principal,
            "has_donation_match": has_donation_match,
            "total_donation_influence": round(total_influence, 2),
        })

        profiles[slug] = {
            "slug":                    slug,
            "name":                    name,
            "firm":                    firm,
            "city":                    city,
            "state":                   state,
            "phone":                   phone,
            "num_principals":          len(regs),
            "num_active":              num_active,
            "total_donation_influence": round(total_influence, 2),
            "principals":              principal_list,
        }

    # Sort index by total_donation_influence desc, then num_principals desc
    index_rows.sort(key=lambda r: (-r["total_donation_influence"], -r["num_principals"]))
    return index_rows, profiles


# ── Build principal profiles ──────────────────────────────────────────────────

def build_principal_data(pri, reg, match, sidecar_by_principal):
    """
    Returns (index_rows, profiles).
    """
    # Registrations by principal
    reg_by_principal = defaultdict(list)
    for _, row in reg.iterrows():
        pname = str(row["principal_name"]).strip()
        lname = str(row["lobbyist_name"]).strip().upper()
        is_active = str(row.get("is_active", "")).lower() in ("true", "1", "yes")
        reg_by_principal[pname].append({
            "lobbyist_name": lname,
            "firm":          str(row.get("firm_name", "")).strip(),
            "branch":        str(row.get("branch", "")).strip(),
            "is_active":     is_active,
            "since":         str(row.get("reg_eff_date", "")).strip(),
        })

    # Donation matches by principal (from principal_matches.csv)
    match_by_principal = defaultdict(list)
    for _, row in match.iterrows():
        pname = str(row["principal_name"]).strip()
        match_by_principal[pname].append({
            "contributor_name": str(row["contributor_name"]).strip(),
            "match_score":      round(float(row["match_score"]), 1),
        })

    index_rows = []
    profiles = {}

    for _, row in pri.iterrows():
        name = str(row["principal_name"]).strip()
        if not name or name.startswith("Test"):
            continue

        slug = slugify(name)
        naics = str(row.get("principal_naics", "") or "").strip()
        city  = str(row.get("city", "") or "").strip()
        state = str(row.get("state", "") or "").strip()

        regs = reg_by_principal.get(name, [])
        num_active = sum(1 for r in regs if r["is_active"])

        don = sidecar_by_principal.get(name, {})
        donation_total = float(don.get("total_donated", 0))
        num_contributions = don.get("num_contributions", 0)
        committees_donated = don.get("committees", [])

        matches = match_by_principal.get(name, [])
        donation_matches = [
            {
                **m,
                "total_donated":      round(float(don.get("total_donated", 0)), 2),
                "num_contributions":  don.get("num_contributions", 0),
                "committees":         committees_donated,
            }
            for m in matches
        ]

        index_rows.append({
            "slug":            slug,
            "name":            name,
            "naics":           naics,
            "city":            city,
            "state":           state,
            "total_lobbyists": len(regs),
            "num_active":      num_active,
            "donation_total":  round(donation_total, 2),
            "num_contributions": num_contributions,
        })

        profiles[slug] = {
            "slug":              slug,
            "name":              name,
            "naics":             naics,
            "city":              city,
            "state":             state,
            "total_lobbyists":   len(regs),
            "num_active":        num_active,
            "donation_total":    round(donation_total, 2),
            "num_contributions": num_contributions,
            "committees_donated": committees_donated,
            "lobbyists":         sorted(regs, key=lambda r: (not r["is_active"], r["lobbyist_name"])),
            "donation_matches":  sorted(donation_matches, key=lambda m: -m["total_donated"]),
        }

    index_rows.sort(key=lambda r: (-r["donation_total"], -r["total_lobbyists"]))
    return index_rows, profiles


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    if not force and LOB_INDEX.exists() and PRI_INDEX.exists():
        print("Lobbyist and principal indexes exist — skipping (use --force to rebuild)")
        return 0

    print("=== Script 26: Export Lobbyist & Principal Profiles ===")

    print("Loading data…")
    lob, reg, pri, match = load_data()
    print(f"  {len(lob):,} lobbyists, {len(reg):,} registrations, {len(pri):,} principals")
    print(f"  {len(match):,} principal→contributor matches")

    print("Loading sidecar donation data from committee files…")
    sidecar = load_sidecar_donations()
    print(f"  {len(sidecar):,} principals with matched donation data")

    print("\nBuilding lobbyist profiles…")
    lob_index, lob_profiles = build_lobbyist_data(lob, reg, sidecar)
    print(f"  {len(lob_index):,} lobbyists in index")
    print(f"  {sum(1 for r in lob_index if r['has_donation_match']):,} with donation cross-ref")

    print("\nBuilding principal profiles…")
    pri_index, pri_profiles = build_principal_data(pri, reg, match, sidecar)
    print(f"  {len(pri_index):,} principals in index")
    print(f"  {sum(1 for r in pri_index if r['donation_total'] > 0):,} with matched donations")

    print("\nWriting lobbyist files…")
    write_json(lob_index, LOB_INDEX)
    for slug, profile in lob_profiles.items():
        write_json(profile, LOB_OUT_DIR / f"{slug}.json")
    print(f"  {len(lob_profiles):,} lobbyist profile files")

    print("Writing principal files…")
    write_json(pri_index, PRI_INDEX)
    for slug, profile in pri_profiles.items():
        write_json(profile, PRI_OUT_DIR / f"{slug}.json")
    print(f"  {len(pri_profiles):,} principal profile files")

    print("\n=== Done ===")
    print(f"Top 5 lobbyists by donation influence:")
    for r in lob_index[:5]:
        print(f"  {r['name']:<35s} {r['num_principals']:>3} principals  ${r['total_donation_influence']:>14,.0f}")

    print(f"\nTop 5 principals by donation activity:")
    for r in pri_index[:5]:
        print(f"  {r['name']:<40s} {r['num_active']:>3} lobbyists  ${r['donation_total']:>14,.0f}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
