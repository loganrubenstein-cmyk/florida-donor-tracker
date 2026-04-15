"""
Script 73: Load candidate_pc_edges.csv and committee_lineage.csv into Supabase.

Truncates and reloads both tables, then populates the legacy candidate_pc_links
table from the new data for backward compatibility until the frontend is updated.

Run after scripts 71 + 72.

Usage:
    python scripts/73_load_linkage_edges_supabase.py
"""

import os
import sys
from io import StringIO
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

ROOT = Path(__file__).resolve().parent.parent
EDGES_CSV   = ROOT / "data" / "processed" / "candidate_pc_edges.csv"
LINEAGE_CSV = ROOT / "data" / "processed" / "committee_lineage.csv"


CHUNK_SIZE = 10_000


def copy_table(cur, df: pd.DataFrame, table: str, columns: list[str]) -> int:
    total = 0
    for start in range(0, len(df), CHUNK_SIZE):
        chunk = df.iloc[start:start + CHUNK_SIZE]
        buf = StringIO()
        chunk[columns].to_csv(buf, index=False, header=False)
        buf.seek(0)
        cur.copy_expert(
            f"COPY {table} ({', '.join(columns)}) FROM STDIN WITH CSV",
            buf,
        )
        total += len(chunk)
    return total


def main() -> int:
    print("=== Script 73: Load Linkage Edges + Lineage → Supabase ===\n")

    for p in (EDGES_CSV, LINEAGE_CSV):
        if not p.exists():
            print(f"ERROR: {p.name} not found. Run scripts 71+72 first.", file=sys.stderr)
            return 1

    edges_df   = pd.read_csv(EDGES_CSV, dtype=str).fillna("")
    lineage_df = pd.read_csv(LINEAGE_CSV, dtype=str).fillna("")

    print(f"Edges:   {len(edges_df):,} rows")
    print(f"Lineage: {len(lineage_df):,} rows")

    # Summary
    print("\nEdge type breakdown:")
    for et, cnt in edges_df["edge_type"].value_counts().items():
        pub = len(edges_df[(edges_df["edge_type"] == et) & (edges_df["is_publishable"] == "true")])
        print(f"  {et:<42s}: {cnt:>6,} total, {pub:>6,} publishable")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        # ── candidate_pc_edges ───────────────────────────────────────────────
        print("\nTruncating candidate_pc_edges...")
        cur.execute("TRUNCATE TABLE candidate_pc_edges RESTART IDENTITY")

        # Prep: convert bool columns to bool-compatible string
        edges_load = edges_df.copy()
        for bool_col in ("is_publishable", "is_candidate_specific"):
            if bool_col in edges_load.columns:
                edges_load[bool_col] = edges_load[bool_col].map(
                    {"true": "true", "false": "false", True: "true", False: "false"}
                ).fillna("false")
            else:
                edges_load[bool_col] = "false"
        # Replace empty strings with NULL for nullable columns
        for col in ("pc_acct_num", "direction", "match_score", "amount", "edge_date"):
            edges_load[col] = edges_load[col].replace("", None)

        n = copy_table(cur, edges_load, "candidate_pc_edges", [
            "candidate_acct_num", "pc_acct_num", "pc_name", "pc_type",
            "edge_type", "direction", "evidence_summary", "source_type",
            "source_record_id", "match_method", "match_score", "amount",
            "edge_date", "is_publishable", "is_candidate_specific",
        ])
        print(f"Loaded {n:,} rows into candidate_pc_edges")

        # ── committee_lineage ────────────────────────────────────────────────
        if len(lineage_df) > 0:
            print("\nTruncating committee_lineage...")
            cur.execute("TRUNCATE TABLE committee_lineage RESTART IDENTITY")
            n = copy_table(cur, lineage_df, "committee_lineage",
                           ["group_id", "acct_num", "role", "evidence"])
            print(f"Loaded {n:,} rows into committee_lineage")
        else:
            print("\nNo lineage records — skipping committee_lineage load")

        # ── Verification counts ──────────────────────────────────────────────
        cur.execute("SELECT COUNT(*) FROM candidate_pc_edges WHERE is_publishable = true")
        pub_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM candidate_pc_edges WHERE is_publishable = true AND is_candidate_specific = true")
        specific_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT candidate_acct_num) FROM candidate_pc_edges WHERE is_publishable = true")
        cand_count = cur.fetchone()[0]
        print(f"\nVerification:")
        print(f"  Publishable edges in DB:          {pub_count:,}")
        print(f"  Candidate-specific edges:         {specific_count:,}")
        print(f"  Affiliated (multi-cand) edges:    {pub_count - specific_count:,}")
        print(f"  Candidates with public links:     {cand_count:,}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
