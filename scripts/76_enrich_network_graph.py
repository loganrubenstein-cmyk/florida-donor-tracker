"""
Script 76: Enrich network_graph.json with industry data.

Reads public/data/network_graph.json (built by script 10).
Queries Supabase for:
  - donor nodes: canonical_name → industry from donors table
  - committee nodes: top-contributing industry from industry_by_committee
Writes enriched JSON back to same file (or --out for alternate path).

Usage:
    python scripts/76_enrich_network_graph.py
    python scripts/76_enrich_network_graph.py --out public/data/network_graph.json
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).parent))

PROJECT_ROOT = Path(__file__).parent.parent
INPUT_FILE   = PROJECT_ROOT / "public" / "data" / "network_graph.json"

# ── DB connection ─────────────────────────────────────────────────────────────

def get_conn():
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env.local")
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("ERROR: SUPABASE_DB_URL not set in .env.local", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def main():
    out_path = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else INPUT_FILE

    print("=== Script 76: Enrich Network Graph with Industry ===\n")

    # Load graph
    print(f"Loading {INPUT_FILE} ...")
    with open(INPUT_FILE, encoding="utf-8") as f:
        graph = json.load(f)

    nodes = graph["nodes"]
    print(f"  {len(nodes)} nodes loaded")

    # Separate donor vs committee nodes
    donor_nodes     = [n for n in nodes if n["type"] in ("corporate", "individual")]
    committee_nodes = [n for n in nodes if n["type"] == "committee"]
    print(f"  Donor nodes: {len(donor_nodes)}, Committee nodes: {len(committee_nodes)}")

    conn = get_conn()
    cur  = conn.cursor()

    # ── Step 1: Fetch industry for donor nodes ─────────────────────────────────
    print("\nFetching donor industries from Supabase ...")
    donor_names = list({n["label"] for n in donor_nodes})
    print(f"  Unique donor labels: {len(donor_names)}")

    industry_map = {}  # canonical_name → industry

    BATCH = 2000
    for i in range(0, len(donor_names), BATCH):
        batch = donor_names[i:i + BATCH]
        cur.execute(
            "SELECT name, industry FROM donors WHERE name = ANY(%s) AND industry IS NOT NULL",
            (batch,)
        )
        for row in cur.fetchall():
            industry_map[row["name"]] = row["industry"]
        print(f"  Batch {i // BATCH + 1}: {len(industry_map)} matches so far", end="\r")

    print(f"\n  Matched industries: {len(industry_map)} / {len(donor_names)}")

    # Step 2 is now done post-graph by aggregating donor edges (see below)

    cur.close()
    conn.close()

    # ── Step 3: Apply industry to donor nodes ──────────────────────────────────
    print("\nApplying industries to donor nodes ...")
    donor_matched = 0
    node_by_id = {n["id"]: n for n in nodes}

    for node in nodes:
        if node["type"] in ("corporate", "individual"):
            ind = industry_map.get(node["label"])
            if ind:
                node["industry"] = ind
                donor_matched += 1
    print(f"  Donor nodes with industry: {donor_matched} / {len(donor_nodes)}")

    # ── Step 4: Derive committee top-industry from donor edges (in-memory) ─────
    print("Deriving committee top-industry from donor edges ...")
    from collections import defaultdict

    SKIP = {"Other", "Not Employed", "Retired"}

    # For each committee, accumulate total $ by industry from incoming donor edges
    committee_industry_totals = defaultdict(lambda: defaultdict(float))
    for edge in graph["edges"]:
        src = node_by_id.get(edge["source"])
        tgt = node_by_id.get(edge["target"])
        if not src or not tgt:
            continue
        if tgt["type"] != "committee":
            continue
        ind = src.get("industry")
        if ind and ind not in SKIP:
            committee_industry_totals[edge["target"]][ind] += edge["total_amount"]

    committee_matched = 0
    for node in nodes:
        if node["type"] == "committee":
            totals = committee_industry_totals.get(node["id"])
            if totals:
                top_industry = max(totals, key=totals.__getitem__)
                node["industry"] = top_industry
                committee_matched += 1
    print(f"  Committee nodes with derived top industry: {committee_matched} / {len(committee_nodes)}")

    # Update meta
    graph["meta"]["industry_enriched"] = True
    graph["meta"]["industry_matched_donors"]     = donor_matched
    graph["meta"]["industry_matched_committees"] = committee_matched

    # Write
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
    size_mb = out_path.stat().st_size / 1_048_576
    print(f"\nWrote {len(nodes)} nodes → {out_path} ({size_mb:.1f} MB)")

    # Summary
    from collections import Counter
    industry_counts = Counter(n.get("industry") for n in nodes if n.get("industry"))
    print("\nIndustry distribution (top 15):")
    for ind, cnt in industry_counts.most_common(15):
        print(f"  {ind:35s} {cnt:5d}")


if __name__ == "__main__":
    main()
