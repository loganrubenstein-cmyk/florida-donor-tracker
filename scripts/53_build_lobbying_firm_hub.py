# scripts/53_build_lobbying_firm_hub.py
"""
Script 53: Build unified lobbying firm hub data.

Merges two data sources:
  1. Individual lobbyist registration profiles (public/data/lobbyists/*.json)
     - Who the registered lobbyists are
     - Which firm they work for
     - Which principals they represent
  2. Compensation data (public/data/lobbyist_comp/by_firm/*.json)
     - How much each firm earns per quarter
     - Which principals are paying them

Produces:
  public/data/lobbying_firms/index.json    top 200 firms sorted by total comp
  public/data/lobbying_firms/{slug}.json   per-firm unified view

Each firm entry contains:
  - firm_name, slug
  - total_comp (est. from comp data)
  - num_registered_lobbyists (from lobbyist reg data)
  - top_clients (from comp data)
  - lobbyists (from reg data)
  - by_quarter (comp trend)

Usage (from project root, with .venv activated):
    python scripts/53_build_lobbying_firm_hub.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

DATA_DIR      = PROJECT_ROOT / "public" / "data"
LOBBYISTS_DIR = DATA_DIR / "lobbyists"
COMP_FIRMS_DIR = DATA_DIR / "lobbyist_comp" / "by_firm"
COMP_TOP_FIRMS = DATA_DIR / "lobbyist_comp" / "top_firms.json"
OUT_DIR       = DATA_DIR / "lobbying_firms"

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")
_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PA|PLLC|PC|P\.A)\.?$",
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
    print("=== Script 53: Build Lobbying Firm Hub ===\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── 1. Build firm registry from lobbyist registration profiles ────────────
    print("1. Building firm registry from lobbyist profiles ...")
    firm_registry: dict[str, dict] = {}  # normalized_firm_name → {firm_name, slug, lobbyists: []}

    lobbyist_files = list(LOBBYISTS_DIR.glob("*.json"))
    print(f"   {len(lobbyist_files)} lobbyist files")

    for lf in lobbyist_files:
        try:
            d = json.loads(lf.read_text())
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        firm_name = d.get("firm", "").strip()
        if not firm_name:
            continue
        norm = normalize(firm_name)
        if norm not in firm_registry:
            slug = slugify(firm_name)
            firm_registry[norm] = {
                "firm_name":   firm_name,
                "slug":        slug,
                "norm":        norm,
                "lobbyists":   [],
            }
        firm_registry[norm]["lobbyists"].append({
            "slug":           d.get("slug", ""),
            "name":           d.get("name", ""),
            "num_principals": d.get("num_principals", 0),
            "total_donation_influence": d.get("total_donation_influence", 0),
        })

    print(f"   Found {len(firm_registry)} unique lobbying firms from registration data")

    # ── 2. Load compensation firm data and merge ──────────────────────────────
    print("\n2. Merging compensation data ...")
    if not COMP_FIRMS_DIR.exists():
        print(f"   WARNING: {COMP_FIRMS_DIR} not found. Run script 48 first.")
    else:
        comp_firm_files = list(COMP_FIRMS_DIR.glob("*.json"))
        print(f"   {len(comp_firm_files)} comp firm files")

        # Build slug → comp data lookup
        comp_by_slug: dict[str, dict] = {}
        comp_by_norm: dict[str, dict] = {}
        for cf in comp_firm_files:
            try:
                d = json.loads(cf.read_text())
                slug = d.get("slug", "")
                name = d.get("firm_name", "")
                if slug:
                    comp_by_slug[slug] = d
                if name:
                    comp_by_norm[normalize(name)] = d
            except Exception:
                pass

        # Merge comp data into firm registry
        matched = 0
        for norm, firm in firm_registry.items():
            slug = firm["slug"]
            comp_data = comp_by_slug.get(slug) or comp_by_norm.get(norm)
            if comp_data:
                firm["total_comp"]    = comp_data.get("total_comp", 0)
                firm["num_principals"] = comp_data.get("num_principals", 0)
                firm["num_quarters"]  = comp_data.get("num_quarters", 0)
                firm["top_clients"]   = comp_data.get("top_clients", [])
                firm["by_quarter"]    = comp_data.get("by_quarter", [])
                firm["comp_slug"]     = comp_data.get("slug", slug)
                matched += 1
            else:
                firm["total_comp"]     = 0
                firm["num_principals"] = 0
                firm["num_quarters"]   = 0
                firm["top_clients"]    = []
                firm["by_quarter"]     = []
                firm["comp_slug"]      = slug

        print(f"   Merged comp data for {matched}/{len(firm_registry)} firms")

        # Also add firms from comp data that aren't in reg data
        for norm_comp, comp_data in comp_by_norm.items():
            if norm_comp not in firm_registry:
                slug = comp_data.get("slug", "")
                name = comp_data.get("firm_name", "")
                if slug and name:
                    firm_registry[norm_comp] = {
                        "firm_name":   name,
                        "slug":        slug,
                        "norm":        norm_comp,
                        "lobbyists":   [],
                        "total_comp":  comp_data.get("total_comp", 0),
                        "num_principals": comp_data.get("num_principals", 0),
                        "num_quarters": comp_data.get("num_quarters", 0),
                        "top_clients": comp_data.get("top_clients", []),
                        "by_quarter":  comp_data.get("by_quarter", []),
                        "comp_slug":   slug,
                    }

    # ── 3. Sort and filter firms ──────────────────────────────────────────────
    all_firms = list(firm_registry.values())
    # Sort by comp first, then by lobbyist count
    all_firms.sort(
        key=lambda x: (x.get("total_comp", 0), len(x.get("lobbyists", []))),
        reverse=True,
    )

    print(f"\n3. Total unique firms: {len(all_firms)}")
    print("   Top 10 by estimated compensation:")
    for i, f in enumerate(all_firms[:10], 1):
        print(f"   {i:2}. {f['firm_name'][:50]:50} ${f.get('total_comp',0):>12,.0f}  {len(f['lobbyists']):3d} lobbyists")

    # ── 4. Write per-firm detail files ────────────────────────────────────────
    print(f"\n4. Writing per-firm files ...")
    num_written = 0
    for firm in all_firms:
        slug = firm.get("comp_slug") or firm["slug"]
        if not slug:
            continue
        # Sort lobbyists by donation influence
        lobbyists_sorted = sorted(
            firm.get("lobbyists", []),
            key=lambda x: x.get("total_donation_influence", 0),
            reverse=True,
        )[:50]

        payload = {
            "firm_name":          firm["firm_name"],
            "slug":               slug,
            "total_comp":         firm.get("total_comp", 0),
            "num_registered_lobbyists": len(firm.get("lobbyists", [])),
            "num_principals":     firm.get("num_principals", 0),
            "num_quarters":       firm.get("num_quarters", 0),
            "top_lobbyists":      lobbyists_sorted,
            "top_clients":        firm.get("top_clients", [])[:20],
            "by_quarter":         firm.get("by_quarter", []),
        }
        (OUT_DIR / f"{slug}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        )
        num_written += 1

    print(f"   Wrote {num_written} firm files")

    # ── 5. Write index ────────────────────────────────────────────────────────
    index = []
    for firm in all_firms:
        slug = firm.get("comp_slug") or firm["slug"]
        if not slug:
            continue
        index.append({
            "firm_name":    firm["firm_name"],
            "slug":         slug,
            "total_comp":   firm.get("total_comp", 0),
            "num_lobbyists": len(firm.get("lobbyists", [])),
            "num_principals": firm.get("num_principals", 0),
        })

    (OUT_DIR / "index.json").write_text(
        json.dumps(index, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"\nWrote index.json ({len(index)} firms)")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
