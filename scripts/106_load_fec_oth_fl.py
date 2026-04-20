#!/usr/bin/env python3
"""
106_load_fec_oth_fl.py

Stream FEC bulk oth (committee-to-committee transfer) files into fec_oth,
filtered to transfers where either side (cmte_id or other_id) is a
Florida-related committee.

"FL-related" = cmte_id in fec_committees WHERE state='FL' OR cmte_id linked
to an FL candidate via fec_candidate_committees.

Mirrors 105_load_fec_indiv_fl.py's streaming pattern.

Prereq: migration 031 applied.

Usage:
    SUPABASE_DB_URL=postgres://... python scripts/106_load_fec_oth_fl.py
    python scripts/106_load_fec_oth_fl.py --cycles 2024,2026
    python scripts/106_load_fec_oth_fl.py --stream
    python scripts/106_load_fec_oth_fl.py --dry-run
"""
import argparse
import os
import sys
import time
import zipfile
from pathlib import Path

import psycopg2
import requests
from psycopg2.extras import execute_values

PROJECT = Path(__file__).resolve().parent.parent
FEC_ROOT = PROJECT / "public" / "data" / "fec"

DEFAULT_CYCLES = [2016, 2018, 2020, 2022, 2024, 2026]
BASE_URL = "https://www.fec.gov/files/bulk-downloads/{cycle}/oth{yy}.zip"
UA = "Mozilla/5.0 (compatible; FLDonorTracker/1.0)"
BATCH = 5000

# FEC itoth.txt shares column layout with itpas2.txt (21 fields).
COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id",
]
SUB_ID_IDX = COLS.index("sub_id")
OTHER_IDX  = COLS.index("other_id")
CMTE_IDX   = COLS.index("cmte_id")
AMT_IDX    = COLS.index("transaction_amt")
DT_IDX     = COLS.index("transaction_dt")

INSERT_SQL = """
    insert into fec_oth (
      sub_id, cmte_id, cycle, amndt_ind, rpt_tp, transaction_pgi,
      image_num, transaction_tp, entity_tp, name, city, state, zip,
      employer, occupation, transaction_dt, transaction_amt,
      other_id, tran_id, file_num, memo_cd, memo_text
    ) values %s
    on conflict (sub_id) do nothing
"""


def parse_dt(raw):
    raw = (raw or "").strip()
    if len(raw) != 8 or not raw.isdigit():
        return None
    return f"{raw[4:8]}-{raw[0:2]}-{raw[2:4]}"


def parse_amt(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def load_fl_committee_ids(conn, cycle: int) -> set:
    """All FEC committee IDs tied to FL for this cycle."""
    ids = set()
    with conn.cursor() as cur:
        cur.execute("select cmte_id from fec_committees where state = 'FL' and cycle = %s", (cycle,))
        for (c,) in cur.fetchall():
            if c: ids.add(c.strip())
        cur.execute("""
            select distinct cc.cmte_id
            from fec_candidate_committees cc
            join fec_candidates cd on cd.cand_id = cc.cand_id and cd.cycle = cc.cycle
            where cd.state = 'FL' and cc.cycle = %s
        """, (cycle,))
        for (c,) in cur.fetchall():
            if c: ids.add(c.strip())
    return ids


def download(cycle: int, dest_dir: Path) -> Path:
    yy = str(cycle)[-2:]
    url = BASE_URL.format(cycle=cycle, yy=yy)
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / f"oth{yy}.zip"
    if zip_path.exists():
        print(f"  [cache] {zip_path.name} already present ({zip_path.stat().st_size / 1e6:.1f} MB)")
        return zip_path
    print(f"  downloading {url}")
    t0 = time.time()
    with requests.get(url, stream=True, headers={"User-Agent": UA}, timeout=120) as r:
        r.raise_for_status()
        with open(zip_path, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
    print(f"  downloaded {zip_path.stat().st_size / 1e6:.1f} MB in {time.time() - t0:.1f}s")
    return zip_path


def iter_rows(zip_path: Path):
    with zipfile.ZipFile(zip_path) as zf:
        inner = next((n for n in zf.namelist() if n.lower().endswith(".txt")), None)
        if not inner:
            raise RuntimeError(f"No .txt entry inside {zip_path.name}")
        with zf.open(inner) as fh:
            for raw in fh:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line:
                    continue
                fields = line.split("|")
                if len(fields) < len(COLS):
                    fields = fields + [""] * (len(COLS) - len(fields))
                elif len(fields) > len(COLS):
                    fields = fields[:len(COLS)]
                yield fields


def row_to_tuple(fields, cycle: int):
    sub_id = (fields[SUB_ID_IDX] or "").strip()
    if not sub_id:
        return None
    return (
        sub_id,
        fields[CMTE_IDX].strip(),
        cycle,
        fields[1].strip() or None,
        fields[2].strip() or None,
        fields[3].strip() or None,
        fields[4].strip() or None,
        fields[5].strip() or None,
        fields[6].strip() or None,
        fields[7].strip() or None,
        fields[8].strip() or None,
        fields[9].strip() or None,
        fields[10].strip() or None,
        fields[11].strip() or None,
        fields[12].strip() or None,
        parse_dt(fields[DT_IDX]),
        parse_amt(fields[AMT_IDX]),
        fields[OTHER_IDX].strip() or None,
        fields[16].strip() or None,
        fields[17].strip() or None,
        fields[18].strip() or None,
        fields[19].strip() or None,
    )


def load_cycle(conn, cycle: int, zip_path: Path, dry_run: bool, fl_ids: set):
    t0 = time.time()
    total_seen = 0
    total_kept = 0
    batch = []
    with conn.cursor() as cur:
        for fields in iter_rows(zip_path):
            total_seen += 1
            cmte = (fields[CMTE_IDX] or "").strip()
            other = (fields[OTHER_IDX] or "").strip()
            if cmte not in fl_ids and other not in fl_ids:
                continue
            row = row_to_tuple(fields, cycle)
            if row is None:
                continue
            batch.append(row)
            if len(batch) >= BATCH:
                if not dry_run:
                    execute_values(cur, INSERT_SQL, batch)
                total_kept += len(batch)
                batch.clear()
        if batch and not dry_run:
            execute_values(cur, INSERT_SQL, batch)
            total_kept += len(batch)
    print(f"  [{cycle}] done. seen={total_seen:,} kept={total_kept:,}  ({time.time() - t0:.0f}s)")
    return total_kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycles", default=",".join(map(str, DEFAULT_CYCLES)))
    ap.add_argument("--stream", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--tmp-dir", default=None)
    args = ap.parse_args()

    cycles = [int(c) for c in args.cycles.split(",") if c.strip()]

    dsn = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("ERROR: SUPABASE_DB_URL not set")

    conn = psycopg2.connect(dsn, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    conn.autocommit = True
    try:
        grand_total = 0
        for cycle in cycles:
            print(f"\n=== Cycle {cycle} ===")
            fl_ids = load_fl_committee_ids(conn, cycle)
            print(f"  {len(fl_ids):,} FL-related committee IDs for this cycle")
            if not fl_ids:
                print("  [skip] no FL committees known for this cycle — need to run 104 first")
                continue
            dest_dir = Path(args.tmp_dir) / str(cycle) if args.tmp_dir else FEC_ROOT / str(cycle)
            zip_path = download(cycle, dest_dir)
            try:
                kept = load_cycle(conn, cycle, zip_path, args.dry_run, fl_ids)
                grand_total += kept
            finally:
                if args.stream and zip_path.exists():
                    zip_path.unlink()
                    print(f"  [{cycle}] removed {zip_path.name}")

        if not args.dry_run:
            print("\nRefreshing fec_oth_recipient_totals_mv …")
            with conn.cursor() as cur:
                cur.execute("set statement_timeout = 0")
                cur.execute("refresh materialized view fec_oth_recipient_totals_mv")
        print(f"\nTOTAL FL-related oth rows loaded across cycles: {grand_total:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
