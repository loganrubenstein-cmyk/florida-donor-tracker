#!/usr/bin/env python3
"""
40_load_supabase.py
Bulk-loads all Florida Donor Tracker data from existing JSON/CSV files
into Supabase (Postgres). Run after any pipeline update to refresh the DB.

Usage:
    cd ~/Claude\ Projects/florida-donor-tracker
    python3 scripts/40_load_supabase.py
"""

import json
import os
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

DATA_DIR = PROJECT_ROOT / "public" / "data"

BATCH_SIZE = 2000


# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(name):
    """Matches lib/slugify.js and script 25 logic exactly."""
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def flush(cur, sql, rows):
    if not rows:
        return 0
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)
    return len(rows)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Loaders ───────────────────────────────────────────────────────────────────

def load_donors(cur):
    print("Loading donors...")
    index = load_json(DATA_DIR / "donors" / "index.json")
    rows = [
        (d["slug"], d["name"], d.get("is_corporate", False),
         d.get("total_soft", 0), d.get("total_hard", 0), d.get("total_combined", 0),
         d.get("num_contributions", 0), d.get("top_occupation"),
         d.get("top_location"), d.get("num_committees", 0),
         d.get("num_candidates", 0), d.get("has_lobbyist_link", False),
         d.get("industry"))
        for d in index
    ]
    n = flush(cur, """
        INSERT INTO donors
          (slug, name, is_corporate, total_soft, total_hard, total_combined,
           num_contributions, top_occupation, top_location, num_committees,
           num_candidates, has_lobbyist_link, industry)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, rows)
    print(f"  → {n:,} donors")


def load_donor_details(cur):
    print("Loading donor detail tables (committees, candidates, by_year)...")
    donors_dir = DATA_DIR / "donors"
    files = [f for f in donors_dir.glob("*.json") if f.name != "index.json"]
    total = len(files)

    dc_rows, dcan_rows, dy_rows = [], [], []
    dc_total = dcan_total = dy_total = 0

    for i, fpath in enumerate(files):
        if i % 5000 == 0 and i > 0:
            print(f"  {i:,}/{total:,}...")
        try:
            d = load_json(fpath)
        except Exception:
            continue

        if not isinstance(d, dict):
            continue

        slug = d.get("slug", fpath.stem)

        for c in d.get("committees", []):
            dc_rows.append((slug, c.get("acct_num"), c.get("committee_name"),
                            c.get("total"), c.get("num_contributions")))

        for c in d.get("candidates", []):
            dcan_rows.append((slug, c.get("acct_num"), c.get("candidate_name"),
                              c.get("total"), c.get("num_contributions")))

        for y in d.get("by_year", []):
            dy_rows.append((slug, y.get("year"), y.get("soft", 0),
                            y.get("hard", 0), y.get("total", 0)))

        if len(dc_rows) >= BATCH_SIZE * 5:
            dc_total += flush(cur, "INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions) VALUES %s", dc_rows)
            dc_rows = []
        if len(dcan_rows) >= BATCH_SIZE * 5:
            dcan_total += flush(cur, "INSERT INTO donor_candidates (donor_slug, acct_num, candidate_name, total, num_contributions) VALUES %s", dcan_rows)
            dcan_rows = []
        if len(dy_rows) >= BATCH_SIZE * 5:
            dy_total += flush(cur, "INSERT INTO donor_by_year (donor_slug, year, soft, hard, total) VALUES %s", dy_rows)
            dy_rows = []

    dc_total += flush(cur, "INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions) VALUES %s", dc_rows)
    dcan_total += flush(cur, "INSERT INTO donor_candidates (donor_slug, acct_num, candidate_name, total, num_contributions) VALUES %s", dcan_rows)
    dy_total += flush(cur, "INSERT INTO donor_by_year (donor_slug, year, soft, hard, total) VALUES %s", dy_rows)
    print(f"  → {dc_total:,} donor_committees, {dcan_total:,} donor_candidates, {dy_total:,} donor_by_year")


def load_candidates(cur):
    print("Loading candidates...")
    cand_rows, quarterly_rows, top_donor_rows = [], [], []

    cand_dir = DATA_DIR / "candidates"
    files = list(cand_dir.glob("*.json"))
    print(f"  Reading {len(files):,} candidate profiles...")

    for fpath in files:
        try:
            d = load_json(fpath)
        except Exception:
            continue
        acct = d.get("acct_num")
        if not acct:
            continue

        hm = d.get("hard_money", {})
        def int_or_none(v):
            if v is None or v == '':
                return None
            try:
                return int(v)
            except (ValueError, TypeError):
                return None
        cand_rows.append((
            str(acct), d.get("candidate_name"), d.get("election_id"),
            int_or_none(d.get("election_year")), d.get("office_code"), d.get("office_desc"),
            d.get("party_code"), d.get("district"), d.get("status_desc"),
            hm.get("total", 0), hm.get("corporate_total", 0),
            hm.get("individual_total", 0), hm.get("num_contributions", 0),
            d.get("soft_money_total", 0), d.get("total_combined", 0),
            len(d.get("linked_pcs", []))
        ))

        for entry in hm.get("by_quarter", []):
            if isinstance(entry, dict):
                quarterly_rows.append((str(acct), entry.get("period"), entry.get("amount", 0)))

        for td in hm.get("top_donors", []):
            donor_name = td.get("name", "")
            top_donor_rows.append((
                str(acct), donor_name, slugify(donor_name),
                td.get("total_amount"), td.get("num_contributions"),
                td.get("type"), td.get("occupation")
            ))

    flush(cur, """
        INSERT INTO candidates
          (acct_num, candidate_name, election_id, election_year, office_code,
           office_desc, party_code, district, status_desc, hard_money_total,
           hard_corporate_total, hard_individual_total, hard_num_contributions,
           soft_money_total, total_combined, num_linked_pcs)
        VALUES %s ON CONFLICT (acct_num) DO NOTHING
    """, cand_rows)
    flush(cur, "INSERT INTO candidate_quarterly (acct_num, quarter, amount) VALUES %s", quarterly_rows)
    flush(cur, "INSERT INTO candidate_top_donors (acct_num, donor_name, donor_slug, total_amount, num_contributions, type, occupation) VALUES %s", top_donor_rows)
    print(f"  → {len(cand_rows):,} candidates, {len(quarterly_rows):,} quarterly rows, {len(top_donor_rows):,} top donor rows")


def load_committees(cur):
    print("Loading committees...")
    index = load_json(DATA_DIR / "committees" / "index.json")
    comm_rows = [(c["acct_num"], c.get("committee_name"), c.get("total_received", 0), c.get("num_contributions", 0))
                 for c in index]
    flush(cur, """
        INSERT INTO committees (acct_num, committee_name, total_received, num_contributions)
        VALUES %s ON CONFLICT (acct_num) DO NOTHING
    """, comm_rows)
    print(f"  → {len(comm_rows):,} committees")

    print("  Loading committee top donors...")
    td_rows = []
    for fpath in (DATA_DIR / "committees").glob("*.json"):
        if fpath.name == "index.json":
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        if "committee_name" not in d:
            continue
        acct = d.get("acct_num")
        for td in d.get("top_donors", []):
            donor_name = td.get("name", "")
            td_rows.append((str(acct), donor_name, slugify(donor_name),
                            td.get("total_amount"), td.get("num_contributions"),
                            td.get("type")))
    flush(cur, "INSERT INTO committee_top_donors (acct_num, donor_name, donor_slug, total_amount, num_contributions, type) VALUES %s", td_rows)
    print(f"  → {len(td_rows):,} committee top donor rows")


def load_lobbyists(cur):
    print("Loading lobbyists...")
    index = load_json(DATA_DIR / "lobbyists" / "index.json")
    lob_rows = [
        (d["slug"], d["name"], d.get("firm"), d.get("city"), d.get("state"),
         d.get("phone"), d.get("num_principals", 0), d.get("num_active", 0),
         d.get("total_donation_influence", 0), d.get("has_donation_match", False),
         d.get("top_principal"))
        for d in index
    ]
    flush(cur, """
        INSERT INTO lobbyists
          (slug, name, firm, city, state, phone, num_principals, num_active,
           total_donation_influence, has_donation_match, top_principal)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, lob_rows)
    print(f"  → {len(lob_rows):,} lobbyists")

    print("  Loading lobbyist principals...")
    lp_rows = []
    for fpath in (DATA_DIR / "lobbyists").glob("*.json"):
        if fpath.name == "index.json":
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        slug = d.get("slug", fpath.stem)
        for p in d.get("principals", []):
            lp_rows.append((
                slug, p.get("name"), p.get("is_active", False),
                p.get("branch"), p.get("firm"), p.get("since"), p.get("until"),
                p.get("donation_total", 0), p.get("num_contributions", 0)
            ))
    flush(cur, """
        INSERT INTO lobbyist_principals
          (lobbyist_slug, principal_name, is_active, branch, firm, since, until,
           donation_total, num_contributions)
        VALUES %s
    """, lp_rows)
    print(f"  → {len(lp_rows):,} lobbyist_principal rows")


def load_principals(cur):
    print("Loading principals...")
    index = load_json(DATA_DIR / "principals" / "index.json")
    pri_rows = [
        (d["slug"], d["name"], d.get("naics"), d.get("city"), d.get("state"),
         d.get("total_lobbyists", 0), d.get("num_active", 0),
         d.get("donation_total", 0), d.get("num_contributions", 0),
         d.get("industry"))
        for d in index
    ]
    flush(cur, """
        INSERT INTO principals
          (slug, name, naics, city, state, total_lobbyists, num_active,
           donation_total, num_contributions, industry)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, pri_rows)
    print(f"  → {len(pri_rows):,} principals")

    print("  Loading principal detail tables...")
    pl_rows, pdm_rows = [], []
    for fpath in (DATA_DIR / "principals").glob("*.json"):
        if fpath.name in ("index.json", "influence_index.json"):
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        slug = d.get("slug", fpath.stem)
        for lob in d.get("lobbyists", []):
            lob_name = lob.get("lobbyist_name", "")
            pl_rows.append((slug, lob_name, slugify(lob_name),
                            lob.get("firm"), lob.get("branch"),
                            lob.get("is_active", False), lob.get("since")))
        for dm in d.get("donation_matches", []):
            pdm_rows.append((slug, dm.get("contributor_name"),
                             dm.get("match_score"), dm.get("total_donated"),
                             dm.get("num_contributions")))
    flush(cur, """
        INSERT INTO principal_lobbyists
          (principal_slug, lobbyist_name, lobbyist_slug, firm, branch, is_active, since)
        VALUES %s
    """, pl_rows)
    flush(cur, """
        INSERT INTO principal_donation_matches
          (principal_slug, contributor_name, match_score, total_donated, num_contributions)
        VALUES %s
    """, pdm_rows)
    print(f"  → {len(pl_rows):,} principal_lobbyist rows, {len(pdm_rows):,} donation match rows")


def load_industries(cur):
    print("Loading industry tables...")
    summary = load_json(DATA_DIR / "industry_summary.json")
    bucket_rows = [(ind["industry"], ind.get("total", 0), ind.get("count", 0), ind.get("pct", 0))
                   for ind in summary["industries"]]
    flush(cur, "INSERT INTO industry_buckets (industry, total, count, pct) VALUES %s ON CONFLICT (industry) DO NOTHING", bucket_rows)
    print(f"  → {len(bucket_rows)} industry buckets")

    ibc_rows = []
    for fpath in (DATA_DIR / "industries").glob("*.json"):
        try:
            d = load_json(fpath)
        except Exception:
            continue
        acct = d.get("acct_num")
        for entry in d.get("by_industry", []):
            ibc_rows.append((str(acct), entry.get("industry"), entry.get("total", 0)))
    flush(cur, "INSERT INTO industry_by_committee (acct_num, industry, total) VALUES %s", ibc_rows)
    print(f"  → {len(ibc_rows):,} industry_by_committee rows")

    trends = load_json(DATA_DIR / "industry_trends.json")
    it_rows = []
    for year, data in trends.get("by_year", {}).items():
        for industry, total in data.get("by_industry", {}).items():
            it_rows.append((int(year), industry, total))
    flush(cur, "INSERT INTO industry_trends (year, industry, total) VALUES %s", it_rows)
    print(f"  → {len(it_rows)} industry_trend rows")


def load_analysis(cur):
    print("Loading analysis tables...")
    ec = load_json(DATA_DIR / "entity_connections.json")
    ec_rows = []
    for c in ec.get("connections", []):
        ea = c["entity_a"]
        eb = c["entity_b"]
        ea_name = ea["name"] if isinstance(ea, dict) else ea
        eb_name = eb["name"] if isinstance(eb, dict) else eb
        ea_acct = ea.get("acct_num") if isinstance(ea, dict) else None
        eb_acct = eb.get("acct_num") if isinstance(eb, dict) else None
        ec_rows.append((
            ea_name, eb_name, ea_acct, eb_acct,
            c.get("connection_score", 0),
            c.get("shared_treasurer", False), c.get("shared_address", False),
            c.get("shared_phone", False), c.get("shared_chair", False),
            c.get("donor_overlap_pct", 0), c.get("money_between", 0)
        ))
    flush(cur, """
        INSERT INTO entity_connections
          (entity_a, entity_b, entity_a_acct, entity_b_acct, connection_score,
           shared_treasurer, shared_address, shared_phone, shared_chair,
           donor_overlap_pct, money_between)
        VALUES %s
    """, ec_rows)
    print(f"  → {len(ec_rows)} entity connections")

    pc_links = load_json(DATA_DIR / "candidate_pc_links.json")
    pcl_rows = []
    for cand_acct, links in pc_links.items():
        for link in links:
            pcl_rows.append((str(cand_acct), str(link.get("pc_acct")),
                             link.get("pc_name"), link.get("pc_type"),
                             link.get("link_type"), link.get("confidence")))
    flush(cur, """
        INSERT INTO candidate_pc_links
          (candidate_acct_num, pc_acct_num, pc_name, pc_type, link_type, confidence)
        VALUES %s
    """, pcl_rows)
    print(f"  → {len(pcl_rows)} candidate_pc_links")

    cd = load_json(DATA_DIR / "cycle_donors.json")
    cd_rows = []
    for year, donors in cd.items():
        for d in donors:
            cd_rows.append((int(year), d.get("name"), slugify(d.get("name", "")),
                            d.get("total", 0), d.get("num_contributions", 0),
                            d.get("is_corporate", False)))
    flush(cur, """
        INSERT INTO cycle_donors (year, name, slug, total, num_contributions, is_corporate)
        VALUES %s
    """, cd_rows)
    print(f"  → {len(cd_rows)} cycle donor rows")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Connecting to Supabase...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("\nTruncating all tables for clean load...")
        cur.execute("""
            TRUNCATE TABLE
              donors, donor_committees, donor_candidates, donor_by_year,
              candidates, candidate_quarterly, candidate_top_donors,
              committees, committee_top_donors,
              lobbyists, lobbyist_principals,
              principals, principal_lobbyists, principal_donation_matches,
              industry_buckets, industry_by_committee, industry_trends,
              entity_connections, candidate_pc_links, cycle_donors
            RESTART IDENTITY
        """)
        conn.commit()

        print("\n── Loading data ──────────────────────────────────")
        load_donors(cur);         conn.commit()
        load_donor_details(cur);  conn.commit()
        load_candidates(cur);     conn.commit()
        load_committees(cur);     conn.commit()
        load_lobbyists(cur);      conn.commit()
        load_principals(cur);     conn.commit()
        load_industries(cur);     conn.commit()
        load_analysis(cur);       conn.commit()

        print("\n── Row counts ────────────────────────────────────")
        tables = [
            "donors", "donor_committees", "donor_candidates", "donor_by_year",
            "candidates", "candidate_quarterly", "candidate_top_donors",
            "committees", "committee_top_donors",
            "lobbyists", "lobbyist_principals",
            "principals", "principal_lobbyists", "principal_donation_matches",
            "industry_buckets", "industry_by_committee", "industry_trends",
            "entity_connections", "candidate_pc_links", "cycle_donors",
        ]
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            print(f"  {table:<35} {count:>10,}")

        print("\n✓ Load complete.")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
