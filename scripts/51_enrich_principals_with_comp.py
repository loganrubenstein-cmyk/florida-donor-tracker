# scripts/51_enrich_principals_with_comp.py
"""
Script 51: Enrich principal profiles with lobbying compensation data.

Connects two data layers:
  1. principals/index.json   — lobbyist registration principals (who hires lobbyists)
  2. lobbyist_comp/           — compensation amounts paid to lobbying firms (how much)

Also enriches principals/{slug}.json profile pages with comp_total.

Adds to principals/index.json entries:
  comp_total   (est. total lobbying spend, from script 47/48 data)
  comp_periods (number of quarters with comp data)
  comp_slug    (slug in lobbyist_comp/by_principal/ if different)

Produces:
  public/data/principals/index.json      (updated in-place, adds comp fields)
  public/data/principals/influence_index.json   combined view sorted by total influence
     (campaign donations + lobbying compensation)

Usage (from project root, with .venv activated):
    python scripts/51_enrich_principals_with_comp.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

DATA_DIR     = PROJECT_ROOT / "public" / "data"
PRIN_DIR     = DATA_DIR / "principals"
COMP_DIR     = DATA_DIR / "lobbyist_comp"

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")
_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PA|PLLC|PC)\.?$",
    re.IGNORECASE,
)


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    for _ in range(2):
        n = _SUFFIX_RE.sub("", s).strip()
        if n == s:
            break
        s = n
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:80]


def main() -> int:
    print("=== Script 51: Enrich Principals with Compensation Data ===\n")

    # Load principals index
    prin_idx_path = PRIN_DIR / "index.json"
    if not prin_idx_path.exists():
        print(f"ERROR: {prin_idx_path} not found.")
        return 1
    principals = json.loads(prin_idx_path.read_text())
    print(f"Loaded {len(principals):,} principals from index")

    # Load top_principals.json from lobbyist_comp (already has cross-refs)
    top_comp_path = COMP_DIR / "top_principals.json"
    if not top_comp_path.exists():
        print(f"ERROR: {top_comp_path} not found. Run script 48 first.")
        return 1
    top_comp = json.loads(top_comp_path.read_text())
    print(f"Loaded {len(top_comp):,} entries from lobbyist_comp/top_principals.json")

    # Build normalized name → comp data lookup
    comp_by_slug: dict[str, dict] = {}    # slug → comp record
    comp_by_norm: dict[str, dict] = {}    # normalized name → comp record
    for entry in top_comp:
        s = entry.get("slug", "")
        if s:
            comp_by_slug[s] = entry
        norm = normalize(entry.get("principal_name", ""))
        if norm:
            comp_by_norm[norm] = entry

    # Also scan all by_principal files for total coverage
    by_prin_dir = COMP_DIR / "by_principal"
    if by_prin_dir.exists():
        all_comp_files = list(by_prin_dir.glob("*.json"))
        print(f"Found {len(all_comp_files):,} individual principal comp files")
        # Build slug → total_comp from all files (not just top 200)
        all_comp_by_slug: dict[str, int] = {}
        all_comp_by_norm: dict[str, dict] = {}
        for f in all_comp_files:
            try:
                d = json.loads(f.read_text())
                slug = d.get("slug", "")
                name = d.get("principal_name", "")
                if slug:
                    all_comp_by_slug[slug] = d.get("total_comp", 0)
                if name:
                    all_comp_by_norm[normalize(name)] = {
                        "total_comp":   d.get("total_comp", 0),
                        "slug":         slug,
                        "num_quarters": d.get("num_quarters", 0),
                    }
            except Exception:
                pass
        print(f"  Indexed {len(all_comp_by_slug):,} comp slugs, {len(all_comp_by_norm):,} normalized names")
    else:
        all_comp_by_slug = {}
        all_comp_by_norm = {}

    # Enrich principals index
    matched = 0
    for p in principals:
        slug = p.get("slug", "")
        name = p.get("name", "")
        norm = normalize(name)

        comp_data = None
        # 1. Exact slug match
        if slug in all_comp_by_slug:
            comp_data = {"total_comp": all_comp_by_slug[slug], "comp_slug": slug}
        # 2. Normalized name match
        elif norm in all_comp_by_norm:
            cd = all_comp_by_norm[norm]
            comp_data = {"total_comp": cd["total_comp"], "comp_slug": cd.get("slug", "")}
        # 3. Partial slug match (comp slug from top_comp cross-ref)
        elif slug in comp_by_slug:
            entry = comp_by_slug[slug]
            comp_data = {"total_comp": entry.get("total_comp", 0), "comp_slug": slug}
        # 4. Normalized name in top_comp
        elif norm in comp_by_norm:
            entry = comp_by_norm[norm]
            comp_data = {"total_comp": entry.get("total_comp", 0), "comp_slug": entry.get("slug", "")}

        if comp_data:
            p["comp_total"] = comp_data["total_comp"]
            if comp_data["comp_slug"] and comp_data["comp_slug"] != slug:
                p["comp_slug"] = comp_data["comp_slug"]
            matched += 1
        else:
            p["comp_total"] = 0

    print(f"\nMatched {matched}/{len(principals)} principals to compensation data")

    # Write enriched index back
    prin_idx_path.write_text(
        json.dumps(principals, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"Updated {prin_idx_path.name}")

    # Build influence_index.json — sorted by total influence (donations + comp)
    influence_index = []
    for p in principals:
        donation_total = p.get("donation_total", 0) or 0
        comp_total     = p.get("comp_total", 0) or 0
        total_influence = donation_total + comp_total
        if total_influence > 0:
            influence_index.append({
                "slug":             p.get("slug", ""),
                "name":             p.get("name", ""),
                "industry":         p.get("industry", ""),
                "donation_total":   round(donation_total, 2),
                "comp_total":       comp_total,
                "total_influence":  round(total_influence, 2),
                "num_lobbyists":    p.get("total_lobbyists", 0),
                "num_active_lobbyists": p.get("num_active", 0),
            })

    influence_index.sort(key=lambda x: x["total_influence"], reverse=True)

    out_path = PRIN_DIR / "influence_index.json"
    out_path.write_text(
        json.dumps(influence_index, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"Wrote influence_index.json ({len(influence_index)} principals with influence data)")

    # Print top 10
    print("\nTop 10 principals by total political influence:")
    for i, p in enumerate(influence_index[:10], 1):
        print(f"  {i:2}. {p['name'][:50]:50} donations=${p['donation_total']:>12,.0f}  comp=${p['comp_total']:>10,.0f}  total=${p['total_influence']:>13,.0f}")

    # Enrich individual principal profile pages with comp data
    print("\nEnriching individual principal profile files ...")
    enriched_files = 0
    for p in principals:
        if not p.get("comp_total"):
            continue
        slug = p.get("comp_slug") or p.get("slug", "")
        if not slug:
            continue
        profile_path = PRIN_DIR / f"{p['slug']}.json"
        if not profile_path.exists():
            continue
        try:
            profile = json.loads(profile_path.read_text())
            profile["comp_total"] = p["comp_total"]
            # Also add link to comp profile
            profile["comp_slug"] = p.get("comp_slug") or slug
            profile_path.write_text(
                json.dumps(profile, separators=(",", ":"), ensure_ascii=False)
            )
            enriched_files += 1
        except Exception as e:
            pass

    print(f"  Enriched {enriched_files} principal profile files")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
