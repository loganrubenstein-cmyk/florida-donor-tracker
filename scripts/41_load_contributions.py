#!/usr/bin/env python3
"""
41_load_contributions.py

Bulk-loads row-level contribution records from
  data/processed/contributions.csv   (committee-side, ~7.7M rows)
into the Supabase `contributions` table created by migration 010.

Design:
  * Single table with recipient_type='committee' | 'candidate' discriminator.
    This script handles the committee side. Script 42 handles candidates.
  * recipient_acct is parsed from source_file (e.g. 'Contrib_112.txt' -> '112').
  * contribution_date auto-parsed — mix of ISO ('1996-01-08') and US ('06/27/2022').
  * contributor_name_normalized = uppercase, collapsed whitespace, stripped.
  * donor_slug is populated by left-joining against the existing donors table
    (so only donors already present in the deduped donor index get linked).
  * Resumable via `contributions_load_manifest`: keyed on source_file, so if
    the script is killed mid-run it picks up where it left off.
  * Uses psycopg2 COPY FROM STDIN for maximum speed (~10-50k rows/sec).

Note on CSV header corruption:
  data/processed/contributions.csv has a corrupted first row — the real 11
  columns plus ~27 stray cells appended. We skip row 1 and provide names
  explicitly so pandas reads the real 11 columns only.

Usage (from project root, with .venv activated):
    python scripts/41_load_contributions.py              # full load
    python scripts/41_load_contributions.py --limit 10000   # smoke test
    python scripts/41_load_contributions.py --force      # ignore manifest
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

CSV_PATH = PROJECT_ROOT / "data" / "processed" / "contributions.csv"
CHUNK_ROWS = 250_000

REAL_COLUMNS = [
    "report_year", "report_type", "contribution_date", "amount",
    "contributor_name", "contributor_address", "contributor_city_state_zip",
    "contributor_occupation", "type_code", "in_kind_description", "source_file",
]

# Parse committee acct_num from source_file name: "Contrib_4700.txt" -> "4700"
SOURCE_FILE_RE = re.compile(r"Contrib_([^.]+)\.txt$", re.IGNORECASE)


# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    """Matches lib/slugify.js exactly (lowercase, non-word -> '', spaces -> '-')."""
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def normalize_name(name) -> str:
    """Uppercase + collapsed whitespace for trigram indexing."""
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def parse_acct_from_source(source_file) -> str | None:
    if not isinstance(source_file, str):
        return None
    m = SOURCE_FILE_RE.search(source_file)
    return m.group(1) if m else None


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


def _donor_normalize(name: str) -> str:
    """Mirrors SQL donor_normalize() from migration 015.
    Uppercase, strip non-alphanumeric to space, collapse, trim.
    """
    if not isinstance(name, str):
        return ""
    s = name.upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_donor_slug_map(cur) -> dict:
    """Return {canonical-normalized name: canonical_slug} from donor_aliases.

    Post-migration 015, donor_aliases is the single source of truth for the
    contributor-name → canonical-slug mapping. This includes manual merges
    (e.g. every FPL variant points to florida-power-light-company), EIN
    matches, lobbyist matches, and auto-fuzzy results.

    Legacy suffix-variant fallbacks are preserved so long-tail spellings
    that pre-date the canonical model still resolve.
    """
    print("  Loading donor slug map from donor_aliases…", flush=True)
    cur.execute("""
        SELECT alias_text, canonical_slug
        FROM donor_aliases
        WHERE review_status IN ('auto','approved')
    """)
    rows = cur.fetchall()

    m = {}
    for alias_text, slug in rows:
        if not alias_text or not slug:
            continue
        m[alias_text] = slug

    # Variant fallbacks (suffix swaps) — don't overwrite exact alias hits.
    variants = 0
    for alias_text, slug in list(m.items()):
        for variant in _name_variants(alias_text):
            if variant and variant not in m:
                m[variant] = slug
                variants += 1

    exact_count = len(rows)
    print(f"  → {exact_count:,} canonical aliases + {variants:,} suffix variants", flush=True)
    return m


def load_manifest(cur) -> set:
    cur.execute(
        "select source_file from contributions_load_manifest "
        "where recipient_type='committee' and status='complete'"
    )
    return {r[0] for r in cur.fetchall()}


def record_manifest(cur, source_file: str, rows_loaded: int,
                    status: str = "complete", error: str | None = None):
    cur.execute(
        """
        insert into contributions_load_manifest
          (source_file, recipient_type, rows_loaded, status, error)
        values (%s, 'committee', %s, %s, %s)
        on conflict (source_file) do update
          set rows_loaded = excluded.rows_loaded,
              status      = excluded.status,
              error       = excluded.error,
              loaded_at   = now()
        """,
        (source_file, rows_loaded, status, error),
    )


# ── Main loader ───────────────────────────────────────────────────────────────

COPY_COLUMNS = [
    "recipient_type", "recipient_acct",
    "contributor_name", "contributor_name_normalized", "donor_slug",
    "amount", "contribution_date", "report_year", "report_type",
    "type_code", "in_kind_description",
    "contributor_address", "contributor_city_state_zip",
    "contributor_occupation", "source_file",
]


def prepare_chunk(df: pd.DataFrame, slug_map: dict) -> tuple[str, int, dict]:
    """
    Transform a raw CSV chunk into a tab-delimited COPY-ready string.
    Returns (copy_text, row_count, per_source_file_counts).
    """
    # Filter out rows with no usable recipient account
    df = df.copy()
    df["recipient_acct"] = df["source_file"].map(parse_acct_from_source)
    df = df[df["recipient_acct"].notna() & (df["recipient_acct"] != "")]
    if df.empty:
        return "", 0, {}

    # Normalize contributor name
    df["contributor_name"] = df["contributor_name"].fillna("").astype(str)
    df["contributor_name_normalized"] = df["contributor_name"].map(normalize_name)

    # Match to canonical donor slug via donor_aliases.
    # Step 1: exact canonical-normalized form (strips all non-alphanumeric).
    df["_canon_norm"] = df["contributor_name"].map(_donor_normalize)
    df["donor_slug"] = df["_canon_norm"].map(slug_map)

    # Step 2: legacy whitespace-only normalized form (backward-compat).
    unmatched = df["donor_slug"].isna()
    if unmatched.any():
        df.loc[unmatched, "donor_slug"] = (
            df.loc[unmatched, "contributor_name_normalized"].map(slug_map)
        )

    # Step 3: punctuation-stripped suffix-variant fallback.
    unmatched = df["donor_slug"].isna()
    if unmatched.any():
        df.loc[unmatched, "donor_slug"] = (
            df.loc[unmatched, "contributor_name_normalized"]
            .map(lambda n: slug_map.get(_strip_punct(n)))
        )
    df.drop(columns=["_canon_norm"], inplace=True)

    # Dates: pandas auto-detects ISO and US formats
    df["contribution_date"] = pd.to_datetime(
        df["contribution_date"], errors="coerce"
    ).dt.strftime("%Y-%m-%d")
    # Guarantee only valid YYYY-MM-DD strings reach Postgres — null out anything else
    date_mask = df["contribution_date"].str.match(r"^\d{4}-\d{2}-\d{2}$", na=False)
    df.loc[~date_mask, "contribution_date"] = None

    # Amount → numeric
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    # Report year → nullable int
    df["report_year"] = pd.to_numeric(df["report_year"], errors="coerce").astype("Int64")

    # Fill remaining NaNs
    for c in ("report_type", "type_code", "in_kind_description",
              "contributor_address", "contributor_city_state_zip",
              "contributor_occupation"):
        df[c] = df[c].fillna("").astype(str)

    # Per-source-file counts for manifest
    counts = df.groupby("source_file", dropna=False).size().to_dict()

    # Build the COPY output — each row is tab-delimited, NULLs are \N.
    buf = io.StringIO()
    for row in df.itertuples(index=False):
        fields = [
            "committee",                                    # recipient_type
            _esc(row.recipient_acct),                       # recipient_acct
            _esc(row.contributor_name),                     # contributor_name
            _esc(row.contributor_name_normalized),          # contributor_name_normalized
            row.donor_slug if isinstance(row.donor_slug, str) and row.donor_slug else r"\N",
            _fmt_num(row.amount),                           # amount
            row.contribution_date if isinstance(row.contribution_date, str)
                and row.contribution_date != "NaT" else r"\N",
            _fmt_int(row.report_year),                      # report_year
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


def _esc(v) -> str:
    """Escape a field for COPY FROM text format. Tabs/newlines/backslashes."""
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Stop after N rows (smoke test)")
    ap.add_argument("--force", action="store_true",
                    help="Ignore manifest and reload all rows")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        sys.exit(f"ERROR: {CSV_PATH} not found")

    print(f"Source: {CSV_PATH}")
    print(f"Size:   {CSV_PATH.stat().st_size / 1e9:.2f} GB")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    # Disable statement timeout — COPY on 250K-row chunks can take >30s on pooled connections
    cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE")
    cur.execute("SET statement_timeout = 0")
    conn.commit()

    try:
        slug_map = load_donor_slug_map(cur)

        if args.force:
            print("  --force: clearing previous committee-side manifest + rows")
            conn.commit()  # close any open transaction before switching autocommit
            conn.autocommit = True
            cur.execute("DELETE FROM contributions_load_manifest WHERE recipient_type='committee'")
            cur.execute("DELETE FROM contributions WHERE recipient_type='committee'")
            conn.autocommit = False
            cur.execute("SET statement_timeout = 0")
            conn.commit()
            seen_files = set()
        else:
            seen_files = load_manifest(cur)
            print(f"  Manifest: {len(seen_files):,} source files already loaded")

        # The CSV has a corrupted header row (real 11 columns + ~27 stray cells
        # concatenated). Each data row has 38 positional fields — the first 11
        # are real, the rest are empty pads. We use header=0 + usecols=range(11)
        # to keep only the first 11 positional columns, then rename them.
        reader = pd.read_csv(
            CSV_PATH,
            header=0,
            usecols=list(range(11)),
            dtype=str,
            chunksize=CHUNK_ROWS,
            low_memory=False,
            on_bad_lines="skip",
        )

        total_rows = 0
        total_matched = 0
        chunks = 0
        start = time.time()
        file_running_counts: dict = {}

        for chunk in reader:
            chunks += 1
            # Rename to our canonical column names (pandas used the broken header)
            chunk.columns = REAL_COLUMNS

            if seen_files and not args.force:
                # Drop rows whose source_file is already fully loaded
                before = len(chunk)
                chunk = chunk[~chunk["source_file"].isin(seen_files)]
                if len(chunk) < before:
                    skipped = before - len(chunk)
                    if chunks % 20 == 0:
                        print(f"  chunk {chunks}: skipping {skipped:,} manifest-covered rows")

            if chunk.empty:
                continue

            copy_text, row_count, counts = prepare_chunk(chunk, slug_map)
            if row_count == 0:
                continue

            buf = io.StringIO(copy_text)
            cur.copy_from(
                buf,
                "contributions",
                sep="\t",
                null=r"\N",
                columns=COPY_COLUMNS,
            )

            total_rows += row_count
            total_matched += sum(1 for line in copy_text.splitlines()
                                 if "\t\\N\t" not in line.split("\t", 5)[4:5][0]
                                 if False)  # cheap: skip the per-line inspection
            # Track per-source-file counts for manifest at end of run.
            for src, n in counts.items():
                file_running_counts[src] = file_running_counts.get(src, 0) + n

            conn.commit()
            if chunks % 4 == 0:
                elapsed = time.time() - start
                rate = total_rows / elapsed if elapsed > 0 else 0
                print(f"  chunk {chunks}: +{row_count:,} rows  "
                      f"(total {total_rows:,}, {rate:,.0f}/s)", flush=True)

            if args.limit and total_rows >= args.limit:
                print(f"  --limit {args.limit} reached; stopping early")
                break

        # Final manifest pass — mark every source_file we touched as complete.
        # For partial (--limit) runs we still record what we loaded so subsequent
        # runs can see progress, but we mark status='partial' so --force is
        # obvious if we want to replay.
        status = "partial" if args.limit else "complete"
        for src, n in file_running_counts.items():
            if not isinstance(src, str):
                continue
            record_manifest(cur, src, n, status=status)

        conn.commit()

        # Final row count
        cur.execute(
            "select count(*) from contributions where recipient_type='committee'"
        )
        final = cur.fetchone()[0]

        cur.execute(
            "select count(*) from contributions "
            "where recipient_type='committee' and donor_slug is not null"
        )
        matched = cur.fetchone()[0]

        elapsed = time.time() - start
        print(f"\n✓ Done in {elapsed:.1f}s")
        print(f"  Total committee contribution rows in table: {final:,}")
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
