#!/usr/bin/env python3
"""
105_load_fec_indiv_fl.py

Stream FEC bulk individual-contribution files (itcont.txt) into fec_indiv,
filtering to STATE='FL' at parse time so the DB row count stays bounded.

Disk strategy — addresses the prior OOM/full-disk incident:
  1. Download indiv{YY}.zip into public/data/fec/{cycle}/ (or --tmp-dir).
  2. Stream-extract inside Python (never materialize the .txt on disk if
     --stream; default keeps the .txt for re-runs).
  3. Read the entry line-by-line, filter STATE='FL', batch-insert with
     execute_values (BATCH rows at a time).
  4. On success, delete the zip and the extracted .txt.
  5. REFRESH MATERIALIZED VIEW fec_indiv_donor_totals_mv at the end.

Prereq: migration 029 applied.

Usage:
    SUPABASE_DB_URL=postgres://... python scripts/105_load_fec_indiv_fl.py
    python scripts/105_load_fec_indiv_fl.py --cycles 2024,2026
    python scripts/105_load_fec_indiv_fl.py --stream          # delete-as-you-go
    python scripts/105_load_fec_indiv_fl.py --dry-run         # parse, no insert
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

BASE_URL = "https://www.fec.gov/files/bulk-downloads/{cycle}/indiv{yy}.zip"
UA = "Mozilla/5.0 (compatible; FLDonorTracker/1.0)"
BATCH = 5000

# FEC itcont.txt column order (21 fields, pipe-delimited, no header).
# https://www.fec.gov/campaign-finance-data/contributions-individuals-file-description/
COLS = [
    "cmte_id", "amndt_ind", "rpt_tp", "transaction_pgi", "image_num",
    "transaction_tp", "entity_tp", "name", "city", "state", "zip",
    "employer", "occupation", "transaction_dt", "transaction_amt",
    "other_id", "tran_id", "file_num", "memo_cd", "memo_text", "sub_id",
]
STATE_IDX = COLS.index("state")
SUB_ID_IDX = COLS.index("sub_id")
AMT_IDX = COLS.index("transaction_amt")
DT_IDX = COLS.index("transaction_dt")

INSERT_SQL = """
    insert into fec_indiv (
      sub_id, cmte_id, cycle, amndt_ind, rpt_tp, transaction_pgi,
      image_num, transaction_tp, entity_tp, name, city, state, zip,
      employer, occupation, transaction_dt, transaction_amt,
      other_id, tran_id, file_num, memo_cd, memo_text
    ) values %s
    on conflict (sub_id) do nothing
"""


def parse_dt(raw: str):
    raw = (raw or "").strip()
    if len(raw) != 8 or not raw.isdigit():
        return None
    # FEC format is MMDDYYYY
    return f"{raw[4:8]}-{raw[0:2]}-{raw[2:4]}"


def parse_amt(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def download(cycle: int, dest_dir: Path) -> Path:
    yy = str(cycle)[-2:]
    url = BASE_URL.format(cycle=cycle, yy=yy)
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / f"indiv{yy}.zip"
    if zip_path.exists():
        print(f"  [cache] {zip_path.name} already present ({zip_path.stat().st_size / 1e9:.2f} GB)")
        return zip_path
    print(f"  downloading {url}")
    t0 = time.time()
    with requests.get(url, stream=True, headers={"User-Agent": UA}, timeout=120) as r:
        r.raise_for_status()
        with open(zip_path, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
    print(f"  downloaded {zip_path.stat().st_size / 1e9:.2f} GB in {time.time() - t0:.1f}s")
    return zip_path


def iter_fl_rows(zip_path: Path):
    """Yield (row_list, raw_state) for STATE='FL' rows from the itcont entry."""
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
                    # pad missing trailing fields
                    fields = fields + [""] * (len(COLS) - len(fields))
                elif len(fields) > len(COLS):
                    fields = fields[:len(COLS)]
                if fields[STATE_IDX].strip().upper() != "FL":
                    continue
                yield fields


def row_to_tuple(fields, cycle: int):
    sub_id = (fields[SUB_ID_IDX] or "").strip()
    if not sub_id:
        return None
    return (
        sub_id,
        fields[0].strip(),          # cmte_id
        cycle,
        fields[1].strip() or None,  # amndt_ind
        fields[2].strip() or None,  # rpt_tp
        fields[3].strip() or None,  # transaction_pgi
        fields[4].strip() or None,  # image_num
        fields[5].strip() or None,  # transaction_tp
        fields[6].strip() or None,  # entity_tp
        fields[7].strip() or None,  # name
        fields[8].strip() or None,  # city
        "FL",
        fields[10].strip() or None, # zip
        fields[11].strip() or None, # employer
        fields[12].strip() or None, # occupation
        parse_dt(fields[DT_IDX]),
        parse_amt(fields[AMT_IDX]),
        fields[15].strip() or None, # other_id
        fields[16].strip() or None, # tran_id
        fields[17].strip() or None, # file_num
        fields[18].strip() or None, # memo_cd
        fields[19].strip() or None, # memo_text
    )


def load_cycle(conn, cycle: int, zip_path: Path, dry_run: bool):
    t0 = time.time()
    total_seen = 0
    total_inserted = 0
    batch = []
    with conn.cursor() as cur:
        for fields in iter_fl_rows(zip_path):
            total_seen += 1
            row = row_to_tuple(fields, cycle)
            if row is None:
                continue
            batch.append(row)
            if len(batch) >= BATCH:
                if not dry_run:
                    execute_values(cur, INSERT_SQL, batch)
                total_inserted += len(batch)
                batch.clear()
                if total_inserted % 100_000 == 0:
                    elapsed = time.time() - t0
                    print(f"  [{cycle}] {total_inserted:,} FL rows inserted  ({elapsed:.0f}s)")
        if batch and not dry_run:
            execute_values(cur, INSERT_SQL, batch)
            total_inserted += len(batch)
    print(f"  [{cycle}] done. seen={total_seen:,} inserted={total_inserted:,}  ({time.time() - t0:.0f}s)")
    return total_inserted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycles", default=",".join(map(str, DEFAULT_CYCLES)))
    ap.add_argument("--stream", action="store_true", help="Delete zip after each cycle loads")
    ap.add_argument("--dry-run", action="store_true", help="Parse + count, no DB writes")
    ap.add_argument("--tmp-dir", default=None, help="Override download dir (default: public/data/fec/{cycle})")
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
            dest_dir = Path(args.tmp_dir) / str(cycle) if args.tmp_dir else FEC_ROOT / str(cycle)
            zip_path = download(cycle, dest_dir)
            try:
                inserted = load_cycle(conn, cycle, zip_path, args.dry_run)
                grand_total += inserted
            finally:
                if args.stream and zip_path.exists():
                    zip_path.unlink()
                    print(f"  [{cycle}] removed {zip_path.name}")

        if not args.dry_run:
            print("\nRefreshing fec_indiv_donor_totals_mv …")
            with conn.cursor() as cur:
                cur.execute("set statement_timeout = 0")
                cur.execute("refresh materialized view concurrently fec_indiv_donor_totals_mv")
        print(f"\nTOTAL FL rows inserted across cycles: {grand_total:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
