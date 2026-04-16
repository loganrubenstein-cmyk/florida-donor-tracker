#!/usr/bin/env python3
"""
42_load_candidate_contributions.py

Bulk-loads row-level contribution records from
  data/processed/candidate_contributions.csv   (~3.2M rows)
into the same Supabase `contributions` table as script 41,
with recipient_type='candidate'.

Column layout in candidate_contributions.csv (21 cols):
  acct_num, candidate_name, election_id, election_year,
  office_code, office_desc, party_code, district,
  report_year, report_type, contribution_date, amount,
  contributor_name, contributor_address, contributor_city_state_zip,
  contributor_occupation, type_code, in_kind_description,
  is_corporate, source_file, status_desc

We write: recipient_type='candidate', recipient_acct=acct_num,
and the standard contribution fields. candidate_name, office_code,
office_desc, party_code, district are ignored (join to candidates table).

Usage (from project root, with .venv activated):
    python scripts/42_load_candidate_contributions.py              # full load
    python scripts/42_load_candidate_contributions.py --limit 10000
    python scripts/42_load_candidate_contributions.py --force
"""

import argparse
import io
import os
import re
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

CSV_PATH = PROJECT_ROOT / "data" / "processed" / "candidate_contributions.csv"
CHUNK_ROWS = 25_000   # Small chunks so each COPY takes ~5s — prevents server connection drops

# Parse candidate acct_num from source_file: "CandContrib_37737.txt" -> "37737"
SOURCE_FILE_RE = re.compile(r"CandContrib_([^.]+)\.txt$", re.IGNORECASE)


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize_name(name) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


_SUFFIX_VARIANTS = [
    (re.compile(r"\bINC\.?\b"),         "INC"),
    (re.compile(r"\bCORP\.?\b"),        "CORP"),
    (re.compile(r"\bCORPORATION\b"),    "CORP"),
    (re.compile(r"\bLTD\.?\b"),         "LTD"),
    (re.compile(r"\bLLC\.?\b"),         "LLC"),
    (re.compile(r"\bL\.L\.C\.?\b"),     "LLC"),
    (re.compile(r"\bL\.P\.?\b"),        "LP"),
    (re.compile(r"\bCO\.?\b"),          "CO"),
    (re.compile(r"\bASSOC\.?\b"),       "ASSOC"),
    (re.compile(r"\bCMMTE\b"),          "COMMITTEE"),
    (re.compile(r"\bCMTE\b"),           "COMMITTEE"),
    (re.compile(r"\bNATL\b"),           "NATIONAL"),
    (re.compile(r"\bNATIONAL\b"),       "NATL"),
    (re.compile(r"\bDEM\b"),            "DEMOCRATIC"),
    (re.compile(r"\bREP\b"),            "REPUBLICAN"),
    (re.compile(r"\bFLA\b"),            "FLORIDA"),
    (re.compile(r"\bFL\b"),             "FLORIDA"),
    (re.compile(r"\bASSOCIATION\b"),    "ASSOC"),
]


def _strip_punct(name: str) -> str:
    s = re.sub(r"[.,'\u2019]", "", name)
    return re.sub(r"\s+", " ", s).strip()


def _name_variants(normalized: str):
    stripped = _strip_punct(normalized)
    yield stripped
    for pattern, replacement in _SUFFIX_VARIANTS:
        v = re.sub(pattern, replacement, stripped)
        if v != stripped:
            yield _strip_punct(v)


def parse_acct_from_source(source_file) -> str | None:
    if not isinstance(source_file, str):
        return None
    m = SOURCE_FILE_RE.search(source_file)
    return m.group(1) if m else None


def _donor_normalize(name: str) -> str:
    """Mirrors SQL donor_normalize() from migration 015."""
    if not isinstance(name, str):
        return ""
    s = name.upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_donor_slug_map(cur) -> dict:
    """Return {alias_text: canonical_slug} from donor_aliases. See script 41."""
    print("  Loading donor slug map from donor_aliases…", flush=True)
    cur.execute("""
        SELECT alias_text, canonical_slug
        FROM donor_aliases
        WHERE review_status IN ('auto','approved')
    """)
    rows = cur.fetchall()
    m = {a: s for (a, s) in rows if a and s}
    variants = 0
    for alias_text, slug in list(m.items()):
        for v in _name_variants(alias_text):
            if v and v not in m:
                m[v] = slug
                variants += 1
    print(f"  → {len(rows):,} canonical aliases + {variants:,} suffix variants", flush=True)
    return m


def load_manifest(cur) -> set:
    cur.execute(
        "select source_file from contributions_load_manifest "
        "where recipient_type='candidate' and status='complete'"
    )
    return {r[0] for r in cur.fetchall()}


def record_manifest(cur, source_file: str, rows_loaded: int,
                    status: str = "complete", error: str | None = None):
    cur.execute(
        """
        insert into contributions_load_manifest
          (source_file, recipient_type, rows_loaded, status, error)
        values (%s, 'candidate', %s, %s, %s)
        on conflict (source_file) do update
          set rows_loaded = excluded.rows_loaded,
              status      = excluded.status,
              error       = excluded.error,
              loaded_at   = now()
        """,
        (source_file, rows_loaded, status, error),
    )


# ── COPY helpers ──────────────────────────────────────────────────────────────

COPY_COLUMNS = [
    "recipient_type", "recipient_acct",
    "contributor_name", "contributor_name_normalized", "donor_slug",
    "amount", "contribution_date", "report_year", "report_type",
    "type_code", "in_kind_description",
    "contributor_address", "contributor_city_state_zip",
    "contributor_occupation", "source_file",
]


def _esc(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return r"\N"
    s = str(v)
    if s == "":
        return r"\N"
    return (s.replace("\\", "\\\\")
             .replace("\t", " ")
             .replace("\n", " ")
             .replace("\r", " "))


def _fmt_num(v) -> str:
    if v is None or pd.isna(v):
        return r"\N"
    return f"{float(v):.2f}"


def _fmt_int(v) -> str:
    if v is None or pd.isna(v):
        return r"\N"
    try:
        return str(int(v))
    except (ValueError, TypeError):
        return r"\N"


def prepare_chunk(df: pd.DataFrame, slug_map: dict) -> tuple[str, int, dict]:
    df = df.copy()
    df["recipient_acct"] = df["source_file"].map(parse_acct_from_source)
    df = df[df["recipient_acct"].notna() & (df["recipient_acct"] != "")]
    if df.empty:
        return "", 0, {}

    df["contributor_name"] = df["contributor_name"].fillna("").astype(str)
    df["contributor_name_normalized"] = df["contributor_name"].map(normalize_name)
    df["_canon_norm"] = df["contributor_name"].map(_donor_normalize)
    df["donor_slug"] = df["_canon_norm"].map(slug_map)

    unmatched = df["donor_slug"].isna()
    if unmatched.any():
        df.loc[unmatched, "donor_slug"] = (
            df.loc[unmatched, "contributor_name_normalized"].map(slug_map)
        )
    unmatched = df["donor_slug"].isna()
    if unmatched.any():
        df.loc[unmatched, "donor_slug"] = (
            df.loc[unmatched, "contributor_name_normalized"]
            .map(lambda n: slug_map.get(_strip_punct(n)))
        )
    df.drop(columns=["_canon_norm"], inplace=True)

    df["contribution_date"] = pd.to_datetime(
        df["contribution_date"], errors="coerce"
    ).dt.strftime("%Y-%m-%d")
    # Guard — null out any non-YYYY-MM-DD values
    date_mask = df["contribution_date"].str.match(r"^\d{4}-\d{2}-\d{2}$", na=False)
    df.loc[~date_mask, "contribution_date"] = None

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["report_year"] = pd.to_numeric(df["report_year"], errors="coerce").astype("Int64")

    for c in ("report_type", "type_code", "in_kind_description",
              "contributor_address", "contributor_city_state_zip",
              "contributor_occupation"):
        df[c] = df[c].fillna("").astype(str)

    counts = df.groupby("source_file", dropna=False).size().to_dict()

    buf = io.StringIO()
    for row in df.itertuples(index=False):
        fields = [
            "candidate",
            _esc(row.recipient_acct),
            _esc(row.contributor_name),
            _esc(row.contributor_name_normalized),
            row.donor_slug if isinstance(row.donor_slug, str) and row.donor_slug else r"\N",
            _fmt_num(row.amount),
            row.contribution_date if isinstance(row.contribution_date, str)
                and row.contribution_date != "NaT" else r"\N",
            _fmt_int(row.report_year),
            _esc(row.report_type),
            _esc(row.type_code),
            _esc(row.in_kind_description),
            _esc(row.contributor_address),
            _esc(row.contributor_city_state_zip),
            _esc(row.contributor_occupation),
            _esc(row.source_file if isinstance(row.source_file, str) else ""),
        ]
        buf.write("\t".join(fields))
        buf.write("\n")

    return buf.getvalue(), len(df), counts


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        sys.exit(f"ERROR: {CSV_PATH} not found")

    print(f"Source: {CSV_PATH}")
    print(f"Size:   {CSV_PATH.stat().st_size / 1e9:.2f} GB")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    # Ensure read-write mode and disable statement timeout for long COPY operations
    cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE")
    cur.execute("SET statement_timeout = 0")
    conn.commit()

    try:
        slug_map = load_donor_slug_map(cur)

        if args.force:
            print("  --force: clearing previous candidate-side manifest + rows")
            conn.commit()  # close any open transaction before switching autocommit
            conn.autocommit = True
            cur.execute("DELETE FROM contributions_load_manifest WHERE recipient_type='candidate'")
            cur.execute("DELETE FROM contributions WHERE recipient_type='candidate'")
            conn.autocommit = False
            cur.execute("SET statement_timeout = 0")
            conn.commit()
            seen_files = set()
        else:
            seen_files = load_manifest(cur)
            print(f"  Manifest: {len(seen_files):,} source files already loaded")

        reader = pd.read_csv(
            CSV_PATH,
            dtype=str,
            chunksize=CHUNK_ROWS,
            low_memory=False,
            on_bad_lines="skip",
        )

        total_rows = 0
        chunks = 0
        start = time.time()
        file_running_counts: dict = {}

        for chunk in reader:
            chunks += 1

            if seen_files and not args.force:
                before = len(chunk)
                chunk = chunk[~chunk["source_file"].isin(seen_files)]
                if len(chunk) < before and chunks % 20 == 0:
                    print(f"  chunk {chunks}: skipping {before - len(chunk):,} manifest-covered rows")

            if chunk.empty:
                continue

            copy_text, row_count, counts = prepare_chunk(chunk, slug_map)
            if row_count == 0:
                continue

            # COPY with reconnect on server disconnect
            for attempt in range(3):
                try:
                    buf = io.StringIO(copy_text)
                    cur.copy_from(buf, "contributions", sep="\t", null=r"\N", columns=COPY_COLUMNS)
                    break
                except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                    if attempt == 2:
                        raise
                    print(f"  Connection dropped (attempt {attempt+1}), reconnecting…", flush=True)
                    try: conn.close()
                    except Exception: pass
                    import time as _t; _t.sleep(3 * (attempt + 1))
                    conn = psycopg2.connect(DB_URL)
                    conn.autocommit = False
                    cur = conn.cursor()
                    cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE")
                    cur.execute("SET statement_timeout = 0")
                    conn.commit()

            total_rows += row_count
            for src, n in counts.items():
                file_running_counts[src] = file_running_counts.get(src, 0) + n

            # Commit every chunk — keeps transactions short to avoid pgBouncer timeouts
            conn.commit()
            if chunks % 40 == 0:
                elapsed = time.time() - start
                rate = total_rows / elapsed if elapsed > 0 else 0
                print(f"  chunk {chunks}: +{row_count:,} rows  (total {total_rows:,}, {rate:,.0f}/s)", flush=True)

            if args.limit and total_rows >= args.limit:
                print(f"  --limit {args.limit} reached; stopping early")
                break

        status = "partial" if args.limit else "complete"
        for src, n in file_running_counts.items():
            if not isinstance(src, str):
                continue
            record_manifest(cur, src, n, status=status)

        conn.commit()

        cur.execute("select count(*) from contributions where recipient_type='candidate'")
        final = cur.fetchone()[0]
        cur.execute(
            "select count(*) from contributions "
            "where recipient_type='candidate' and donor_slug is not null"
        )
        matched = cur.fetchone()[0]

        elapsed = time.time() - start
        print(f"\n✓ Done in {elapsed:.1f}s")
        print(f"  Total candidate contribution rows in table: {final:,}")
        print(f"  Rows matched to donor slug:                 {matched:,} "
              f"({(matched / final * 100) if final else 0:.1f}%)")
        print(f"  Source files recorded in manifest:          {len(file_running_counts):,}")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
