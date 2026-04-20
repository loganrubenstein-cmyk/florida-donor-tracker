#!/usr/bin/env python3
"""
104_load_fec_fl.py

Load FEC bulk data into Supabase, scoped to FL federal candidates.

Flow per cycle:
  1. Parse cn{YY}.txt, keep only CAND_ST='FL' -> fec_candidates
  2. Build fl_cand_ids set
  3. Parse ccl{YY}.txt, keep rows where cand_id in fl_cand_ids -> fec_candidate_committees
  4. Build fl_cmte_ids set (committees linked to FL candidates)
  5. Parse cm{YY}.txt, keep rows where cmte_id in fl_cmte_ids -> fec_committees
  6. Parse pas226.txt (pipe-delimited), keep rows where CAND_ID in fl_cand_ids -> fec_pas2
  7. Stream indiv{YY}.txt, keep rows where CMTE_ID in fl_cmte_ids -> fec_individual_contribs

Prereq: migration 027 applied. Bulk files downloaded via 103.
"""
import csv
import os
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

PROJECT = Path(__file__).resolve().parent.parent
FEC_ROOT = PROJECT / "public" / "data" / "fec"

CYCLES = [2016, 2018, 2020, 2022, 2024, 2026]

DSN = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
if not DSN:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

# FEC bulk files are pipe-delimited, no header. Columns per file documented at
# https://www.fec.gov/campaign-finance-data/all-candidates-file-description/
CN_COLS = [
    "cand_id","name","party","election_year","state","office","district",
    "ici","status","principal_cmte_id","street1","street2","city","st","zip",
]
CM_COLS = [
    "cmte_id","name","treasurer","street1","street2","city","state","zip",
    "designation","cmte_type","party","filing_freq","org_type","connected_org","cand_id",
]
CCL_COLS = [
    "cand_id","cand_election_year","fec_election_yr","cmte_id","cmte_tp","cmte_dsgn","linkage_id",
]
# pas2 and indiv share schema
TXN_COLS = [
    "cmte_id","amndt_ind","rpt_tp","transaction_pgi","image_num","transaction_tp",
    "entity_tp","donor_name","donor_city","donor_state","donor_zip","donor_employer",
    "donor_occupation","transaction_dt","transaction_amt","other_id","cand_id","tran_id",
    "file_num","memo_cd","memo_text","sub_id",
]
# indiv has same layout but no cand_id (col 17 = tran_id instead) — FEC actually uses 21 cols for indiv
INDIV_COLS = [
    "cmte_id","amndt_ind","rpt_tp","transaction_pgi","image_num","transaction_tp",
    "entity_tp","donor_name","donor_city","donor_state","donor_zip","donor_employer",
    "donor_occupation","transaction_dt","transaction_amt","other_id","tran_id",
    "file_num","memo_cd","memo_text","sub_id",
]


def parse_pipe(path: Path, cols: list[str]):
    with open(path, "r", encoding="latin-1", errors="replace") as f:
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) < len(cols):
                parts = parts + [""] * (len(cols) - len(parts))
            yield dict(zip(cols, parts[: len(cols)]))


def parse_date(s: str):
    s = (s or "").strip()
    if len(s) != 8 or not s.isdigit():
        return None
    try:
        return f"{s[4:8]}-{s[0:2]}-{s[2:4]}"
    except Exception:
        return None


def parse_amt(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_cycle(cur, cycle: int) -> tuple[int, int, int, int]:
    yy = str(cycle)[-2:]
    cdir = FEC_ROOT / str(cycle)

    # FEC bulk unzips to base names without year suffix (e.g., cn.txt, cm.txt, ccl.txt, itpas2.txt)
    cn_path = cdir / "cn.txt"
    cm_path = cdir / "cm.txt"
    ccl_path = cdir / "ccl.txt"
    pas2_path = cdir / "itpas2.txt"
    indiv_path = cdir / "itcont.txt"

    # Some cycles name files differently
    if not pas2_path.exists():
        for alt in [f"pas2{yy}.txt", f"itpas2{yy}.txt"]:
            if (cdir / alt).exists():
                pas2_path = cdir / alt
                break
    if not indiv_path.exists():
        for alt in [f"indiv{yy}.txt", f"itindiv{yy}.txt"]:
            if (cdir / alt).exists():
                indiv_path = cdir / alt
                break

    print(f"\n--- cycle {cycle} ---", flush=True)

    # 1. Candidates (FL)
    n_cand = 0
    fl_cand_ids = set()
    cand_rows = []
    if cn_path.exists():
        for r in parse_pipe(cn_path, CN_COLS):
            if r.get("state", "").strip().upper() != "FL":
                continue
            fl_cand_ids.add(r["cand_id"])
            cand_rows.append((
                r["cand_id"], cycle, r["name"] or "", r["party"] or None,
                int(r["election_year"]) if r.get("election_year","").strip().isdigit() else None,
                r["office"] or None, r["state"] or None, r["district"] or None,
                r["ici"] or None, r["status"] or None, r["principal_cmte_id"] or None,
                r["street1"] or None, r["city"] or None, r["st"] or None, r["zip"] or None,
            ))
        if cand_rows:
            execute_values(cur, """
                insert into fec_candidates
                  (cand_id, cycle, name, party, election_year, office, state, district,
                   ici, status, principal_cmte_id, street1, city, st, zip)
                values %s
                on conflict (cand_id, cycle) do nothing
            """, cand_rows, page_size=1000)
            n_cand = len(cand_rows)
    print(f"  candidates: {n_cand}", flush=True)

    # 2. Linkages (filter by FL candidates)
    n_ccl = 0
    fl_cmte_ids = set()
    ccl_rows = []
    if ccl_path.exists():
        for r in parse_pipe(ccl_path, CCL_COLS):
            if r["cand_id"] not in fl_cand_ids:
                continue
            fl_cmte_ids.add(r["cmte_id"])
            ccl_rows.append((
                r["cand_id"], r["cmte_id"], cycle,
                r["cmte_dsgn"] or None, r["cmte_tp"] or None, None,
                int(r["cand_election_year"]) if r.get("cand_election_year","").strip().isdigit() else None,
            ))
        if ccl_rows:
            execute_values(cur, """
                insert into fec_candidate_committees
                  (cand_id, cmte_id, cycle, designation, cmte_type, cmte_party, election_year)
                values %s
                on conflict (cand_id, cmte_id, cycle) do nothing
            """, ccl_rows, page_size=1000)
            n_ccl = len(ccl_rows)
    # also include principal cmtes from fec_candidates
    for r in cand_rows:
        if r[10]:
            fl_cmte_ids.add(r[10])
    print(f"  linkages: {n_ccl}  (cmte ids: {len(fl_cmte_ids)})", flush=True)

    # 3. Committees
    n_cm = 0
    cm_rows = []
    if cm_path.exists():
        for r in parse_pipe(cm_path, CM_COLS):
            if r["cmte_id"] not in fl_cmte_ids:
                continue
            cm_rows.append((
                r["cmte_id"], cycle, r["name"] or "", r["treasurer"] or None,
                r["street1"] or None, r["city"] or None, r["state"] or None, r["zip"] or None,
                r["designation"] or None, r["cmte_type"] or None, r["party"] or None,
                r["filing_freq"] or None, r["org_type"] or None, r["connected_org"] or None,
                r["cand_id"] or None,
            ))
        if cm_rows:
            execute_values(cur, """
                insert into fec_committees
                  (cmte_id, cycle, name, treasurer, street1, city, state, zip,
                   designation, cmte_type, party, filing_freq, org_type, connected_org, cand_id)
                values %s
                on conflict (cmte_id, cycle) do nothing
            """, cm_rows, page_size=1000)
            n_cm = len(cm_rows)
    print(f"  committees: {n_cm}", flush=True)

    # 4. pas2 (committee -> candidate, filter by FL cand_id)
    n_pas2 = 0
    if pas2_path.exists():
        batch = []
        for r in parse_pipe(pas2_path, TXN_COLS):
            if r["cand_id"] not in fl_cand_ids:
                continue
            batch.append((
                cycle, r["cmte_id"], r["amndt_ind"] or None, r["rpt_tp"] or None,
                r["transaction_pgi"] or None, r["image_num"] or None, r["transaction_tp"] or None,
                r["entity_tp"] or None, r["donor_name"] or None, r["donor_city"] or None,
                r["donor_state"] or None, r["donor_zip"] or None, r["donor_employer"] or None,
                r["donor_occupation"] or None, parse_date(r["transaction_dt"]),
                parse_amt(r["transaction_amt"]), r["other_id"] or None, r["cand_id"] or None,
                r["tran_id"] or None, r["file_num"] or None, r["memo_cd"] or None,
                r["memo_text"] or None, int(r["sub_id"]) if r.get("sub_id","").strip().isdigit() else None,
            ))
            if len(batch) >= 5000:
                execute_values(cur, """
                    insert into fec_pas2
                      (cycle, cmte_id, amndt_ind, rpt_tp, transaction_pgi, image_num,
                       transaction_tp, entity_tp, donor_name, donor_city, donor_state,
                       donor_zip, donor_employer, donor_occupation, transaction_dt,
                       transaction_amt, other_id, cand_id, tran_id, file_num, memo_cd,
                       memo_text, sub_id)
                    values %s
                """, batch, page_size=2000)
                n_pas2 += len(batch)
                batch = []
        if batch:
            execute_values(cur, """
                insert into fec_pas2
                  (cycle, cmte_id, amndt_ind, rpt_tp, transaction_pgi, image_num,
                   transaction_tp, entity_tp, donor_name, donor_city, donor_state,
                   donor_zip, donor_employer, donor_occupation, transaction_dt,
                   transaction_amt, other_id, cand_id, tran_id, file_num, memo_cd,
                   memo_text, sub_id)
                values %s
            """, batch, page_size=2000)
            n_pas2 += len(batch)
    print(f"  pas2: {n_pas2}", flush=True)

    # 5. Individual contribs (filter by FL committee)
    n_indiv = 0
    if indiv_path.exists():
        batch = []
        for r in parse_pipe(indiv_path, INDIV_COLS):
            if r["cmte_id"] not in fl_cmte_ids:
                continue
            batch.append((
                cycle, r["cmte_id"], r["amndt_ind"] or None, r["rpt_tp"] or None,
                r["transaction_pgi"] or None, r["image_num"] or None, r["transaction_tp"] or None,
                r["entity_tp"] or None, r["donor_name"] or None, r["donor_city"] or None,
                r["donor_state"] or None, r["donor_zip"] or None, r["donor_employer"] or None,
                r["donor_occupation"] or None, parse_date(r["transaction_dt"]),
                parse_amt(r["transaction_amt"]), r["other_id"] or None,
                r["tran_id"] or None, r["file_num"] or None, r["memo_cd"] or None,
                r["memo_text"] or None, int(r["sub_id"]) if r.get("sub_id","").strip().isdigit() else None,
            ))
            if len(batch) >= 10000:
                execute_values(cur, """
                    insert into fec_individual_contribs
                      (cycle, cmte_id, amndt_ind, rpt_tp, transaction_pgi, image_num,
                       transaction_tp, entity_tp, donor_name, donor_city, donor_state,
                       donor_zip, donor_employer, donor_occupation, transaction_dt,
                       transaction_amt, other_id, tran_id, file_num, memo_cd,
                       memo_text, sub_id)
                    values %s
                """, batch, page_size=5000)
                n_indiv += len(batch)
                batch = []
        if batch:
            execute_values(cur, """
                insert into fec_individual_contribs
                  (cycle, cmte_id, amndt_ind, rpt_tp, transaction_pgi, image_num,
                   transaction_tp, entity_tp, donor_name, donor_city, donor_state,
                   donor_zip, donor_employer, donor_occupation, transaction_dt,
                   transaction_amt, other_id, tran_id, file_num, memo_cd,
                   memo_text, sub_id)
                values %s
            """, batch, page_size=5000)
            n_indiv += len(batch)
    print(f"  indiv: {n_indiv}", flush=True)

    return n_cand, n_cm, n_pas2, n_indiv


def main():
    print("=" * 72)
    print("104 — load FEC FL federal data")
    print("=" * 72)
    t0 = time.time()

    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("set statement_timeout = 0")

    totals = [0, 0, 0, 0]
    for cycle in CYCLES:
        n = load_cycle(cur, cycle)
        for i, v in enumerate(n):
            totals[i] += v
        conn.commit()

    cur.close()
    conn.close()
    print(f"\nTotals: cand={totals[0]} cm={totals[1]} pas2={totals[2]} indiv={totals[3]}")
    print(f"Elapsed: {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
