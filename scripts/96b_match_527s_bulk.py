"""
Script 96b: Match FL 527 stub orgs via FEC + IRS bulk downloads (no API rate limits).

Replaces the rate-limited FEC API approach in script 96 with two bulk sources:
  1. FEC Committee Master files (cm{YY}.zip) — 2020-2026 cycles
  2. FEC PAC & Party Summary files (webk{YY}.zip) — financial totals
  3. IRS Form 8871/8872 bulk data (fullData download from IRS POFD)

Then fuzzy-matches our FL 527 stubs against both data sets (threshold 78),
updates solicitation_stubs_resolved.csv with fec_* columns, and upserts to
the shadow_orgs Supabase table.

Inputs:
  data/processed/solicitation_stubs_resolved.csv  — from script 92

Outputs:
  data/processed/solicitation_stubs_resolved.csv  — updated with bulk match results
  data/raw/fec/cm{YY}.zip                         — cached FEC committee master zips
  data/raw/fec/webk{YY}.zip                       — cached FEC PAC summary zips
  data/raw/irs/irs_8871_full.zip                  — cached IRS Form 8871 bulk zip

Usage:
  python scripts/96b_match_527s_bulk.py
  python scripts/96b_match_527s_bulk.py --force   # re-download all zip files
"""

import io
import os
import re
import sys
import zipfile
from pathlib import Path

import pandas as pd
import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

# ── Paths ──────────────────────────────────────────────────────────────────────
STUBS_CSV  = PROJECT_ROOT / "data" / "processed" / "solicitation_stubs_resolved.csv"
FEC_DIR    = PROJECT_ROOT / "data" / "raw" / "fec"
IRS_DIR    = PROJECT_ROOT / "data" / "raw" / "irs"

FEC_DIR.mkdir(parents=True, exist_ok=True)
IRS_DIR.mkdir(parents=True, exist_ok=True)

# ── FEC bulk URLs ──────────────────────────────────────────────────────────────
# Committee master: CMTE_ID|CMTE_NM|TRES_NM|CMTE_ST1|CMTE_ST2|CMTE_CITY|
#                   CMTE_ST|CMTE_ZIP|CMTE_DSGN|CMTE_TP|CMTE_PTY_AFFILIATION|
#                   CMTE_FILING_FREQ|ORG_TP|CONNECTED_ORG_NM|CAND_ID
CM_COLS = [
    "CMTE_ID", "CMTE_NM", "TRES_NM", "CMTE_ST1", "CMTE_ST2",
    "CMTE_CITY", "CMTE_ST", "CMTE_ZIP", "CMTE_DSGN", "CMTE_TP",
    "CMTE_PTY_AFFILIATION", "CMTE_FILING_FREQ", "ORG_TP",
    "CONNECTED_ORG_NM", "CAND_ID",
]

# PAC/Party summary: CMTE_ID|CMTE_NM|CMTE_TP|CMTE_DSGN|CMTE_FILING_FREQ|
#   TTL_RECEIPTS|TRANS_FROM_AFF|INDV_CONTRIB|OTHER_POL_CMTE_CONTRIB|
#   CAND_CONTRIB|CAND_LOANS|TTL_LOANS_RECEIVED|TTL_DISB|TRANF_TO_AFF|
#   INDV_REFUNDS|OTHER_POL_CMTE_REFUNDS|CAND_LOAN_REPAY|LOAN_REPAY|
#   COH_BOP|COH_COP|DEBTS_OWED_BY|NONFED_TRANS_RECEIVED|
#   CONTRIB_TO_OTHER_CMTE|IND_EXP|PTY_COORD_EXP|NONFED_SHARE_EXP|CVG_END_DT
WEBK_COLS = [
    "CMTE_ID", "CMTE_NM", "CMTE_TP", "CMTE_DSGN", "CMTE_FILING_FREQ",
    "TTL_RECEIPTS", "TRANS_FROM_AFF", "INDV_CONTRIB", "OTHER_POL_CMTE_CONTRIB",
    "CAND_CONTRIB", "CAND_LOANS", "TTL_LOANS_RECEIVED", "TTL_DISB",
    "TRANF_TO_AFF", "INDV_REFUNDS", "OTHER_POL_CMTE_REFUNDS",
    "CAND_LOAN_REPAY", "LOAN_REPAY", "COH_BOP", "COH_COP",
    "DEBTS_OWED_BY", "NONFED_TRANS_RECEIVED", "CONTRIB_TO_OTHER_CMTE",
    "IND_EXP", "PTY_COORD_EXP", "NONFED_SHARE_EXP", "CVG_END_DT",
]

FEC_BASE = "https://www.fec.gov/files/bulk-downloads"

# Cycles to download: year → 2-digit suffix
FEC_CYCLES = {
    2020: "20",
    2022: "22",
    2024: "24",
    2026: "26",
}

# IRS POFD bulk download (Form 8871 + 8872, all orgs, updated weekly)
IRS_FULL_URL  = "https://forms.irs.gov/app/pod/dataDownload/fullData"
IRS_CACHE_ZIP = IRS_DIR / "irs_8871_full.zip"

# Fuzzy match threshold (token_sort_ratio)
MATCH_THRESHOLD = 78

_PUNCT = re.compile(r"[^A-Z0-9\s]")


def norm(s: str) -> str:
    upper = str(s).upper()
    return " ".join(_PUNCT.sub(" ", upper).split())


def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def safe_float(v) -> float | None:
    try:
        return float(v) if v not in (None, "", "nan") else None
    except (ValueError, TypeError):
        return None


def safe_int(v) -> int | None:
    try:
        return int(float(v)) if v not in (None, "", "nan") else None
    except (ValueError, TypeError):
        return None


# ── Download helpers ───────────────────────────────────────────────────────────

def download_zip(url: str, dest: Path, label: str, force: bool) -> bool:
    """
    Download a zip file to dest if not already cached (or --force).
    Returns True on success, False on failure.
    """
    if dest.exists() and not force:
        print(f"  [cache] {label} → {dest.name}")
        return True

    print(f"  [download] {label} ...", flush=True)
    try:
        r = requests.get(url, timeout=120, stream=True)
        if r.status_code != 200:
            print(f"  WARNING: {label} → HTTP {r.status_code} — skipping")
            return False
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        size_mb = dest.stat().st_size / 1e6
        print(f"  [download] {label} → {size_mb:.1f} MB saved")
        return True
    except Exception as e:
        print(f"  WARNING: {label} failed: {e}")
        if dest.exists():
            dest.unlink()
        return False


def read_pipe_zip(zip_path: Path, col_names: list[str]) -> pd.DataFrame | None:
    """
    Read a pipe-delimited (no-header) text file from inside a zip archive.
    Finds the first .txt file in the zip.
    """
    try:
        with zipfile.ZipFile(zip_path) as zf:
            txt_files = [n for n in zf.namelist() if n.lower().endswith(".txt")]
            if not txt_files:
                print(f"  WARNING: No .txt file found in {zip_path.name}")
                return None
            txt_name = txt_files[0]
            with zf.open(txt_name) as f:
                df = pd.read_csv(
                    f,
                    sep="|",
                    header=None,
                    names=col_names,
                    dtype=str,
                    encoding="latin-1",
                    on_bad_lines="skip",
                )
        return df
    except Exception as e:
        print(f"  WARNING: Could not read {zip_path.name}: {e}")
        return None


# ── Step 1: Build FEC committee master index (all FL committees, 2020-2026) ───

def build_fec_cm_index(force: bool) -> pd.DataFrame:
    """
    Download and combine FEC committee master files for 2020-2026.
    Returns DataFrame of FL committees with CMTE_ID, CMTE_NM, CMTE_TP,
    CMTE_ST, ORG_TP, norm_name.
    """
    frames = []
    for year, suffix in FEC_CYCLES.items():
        url  = f"{FEC_BASE}/{year}/cm{suffix}.zip"
        dest = FEC_DIR / f"cm{suffix}.zip"
        ok   = download_zip(url, dest, f"FEC cm{suffix}.zip ({year})", force)
        if not ok:
            continue
        df = read_pipe_zip(dest, CM_COLS)
        if df is None:
            continue
        df["_cycle"] = year
        frames.append(df)

    if not frames:
        print("  ERROR: No FEC committee master files loaded.")
        return pd.DataFrame(columns=CM_COLS + ["_cycle", "norm_name"])

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.fillna("")

    # Filter: FL committees only (or no state — 527s sometimes omit state)
    fl_mask = combined["CMTE_ST"].str.upper().isin(["FL", ""])
    combined = combined[fl_mask].copy()

    # De-duplicate: keep latest cycle per committee ID
    combined = combined.sort_values("_cycle", ascending=False)
    combined = combined.drop_duplicates(subset=["CMTE_ID"], keep="first")

    combined["norm_name"] = combined["CMTE_NM"].apply(norm)
    print(f"  FEC committee master: {len(combined):,} FL (+ no-state) committees across 2020-2026")
    return combined


# ── Step 2: Build FEC PAC/party financial summary index ───────────────────────

def build_fec_webk_index(force: bool) -> pd.DataFrame:
    """
    Download and combine FEC PAC summary files for 2020-2026.
    Returns DataFrame keyed by CMTE_ID with TTL_RECEIPTS, TTL_DISB, CVG_END_DT.
    """
    frames = []
    for year, suffix in FEC_CYCLES.items():
        url  = f"{FEC_BASE}/{year}/webk{suffix}.zip"
        dest = FEC_DIR / f"webk{suffix}.zip"
        ok   = download_zip(url, dest, f"FEC webk{suffix}.zip ({year})", force)
        if not ok:
            continue
        df = read_pipe_zip(dest, WEBK_COLS)
        if df is None:
            continue
        df["_cycle"] = year
        frames.append(df)

    if not frames:
        print("  WARNING: No FEC PAC summary files loaded — financials will be empty.")
        return pd.DataFrame(columns=["CMTE_ID", "TTL_RECEIPTS", "TTL_DISB", "CVG_END_DT", "_cycle"])

    combined = pd.concat(frames, ignore_index=True).fillna("")

    # Aggregate across cycles: sum receipts/disb, take max coverage date
    combined["TTL_RECEIPTS"] = combined["TTL_RECEIPTS"].apply(safe_float).fillna(0)
    combined["TTL_DISB"]     = combined["TTL_DISB"].apply(safe_float).fillna(0)

    agg = (
        combined.groupby("CMTE_ID", as_index=False)
        .agg(
            fec_total_receipts=("TTL_RECEIPTS", "sum"),
            fec_total_disb=("TTL_DISB", "sum"),
            fec_latest_year=("_cycle", "max"),
        )
    )
    print(f"  FEC PAC summary: {len(agg):,} committees with financial data")
    return agg


# ── Step 3: Build IRS 8871 index ───────────────────────────────────────────────

def build_irs_index(force: bool) -> pd.DataFrame:
    """
    Download IRS POFD full data zip and extract Form 8871 (organization
    registration) records for FL.

    The IRS zip contains multiple files; we look for one whose name contains
    '8871' (case-insensitive). The file is pipe-delimited with a header row.

    Returns DataFrame with: EIN, OrganizationName, norm_name, StateAbbr, Purpose.
    If the file can't be parsed, returns empty DataFrame and logs a warning.
    """
    ok = download_zip(IRS_FULL_URL, IRS_CACHE_ZIP, "IRS POFD fullData", force)
    if not ok:
        return pd.DataFrame()

    try:
        with zipfile.ZipFile(IRS_CACHE_ZIP) as zf:
            names = zf.namelist()
            # Find Form 8871 file (registration, not 8872 periodic reports)
            f8871_files = [n for n in names if "8871" in n.lower() and n.lower().endswith(".txt")]
            if not f8871_files:
                # Fallback: any .txt that isn't obviously 8872
                f8871_files = [n for n in names if n.lower().endswith(".txt") and "8872" not in n.lower()]

            if not f8871_files:
                print(f"  WARNING: Could not find Form 8871 file in IRS zip. Files: {names[:10]}")
                return pd.DataFrame()

            chosen = f8871_files[0]
            print(f"  IRS: reading '{chosen}' from zip (chunked, FL-only) ...", flush=True)

            # The IRS FullDataFile is NOT a standard CSV. Format:
            #   H|date|ver|...     — file header (metadata, not column names)
            #   1|form|seq|...|EIN|OrgName|addr1|addr2|city|state|zip|...
            #   D|seq|id|name|EIN|...  — director records
            #   R|seq|id|name|EIN|...  — related org records
            # Col indices for '1' records: 0=type, 1=form(8871/8872), 6=EIN, 7=OrgName, 11=state
            chunks = []
            with zf.open(chosen) as f:
                for chunk in pd.read_csv(
                    f,
                    sep="|",
                    header=None,
                    dtype=str,
                    encoding="latin-1",
                    on_bad_lines="skip",
                    chunksize=100_000,
                ):
                    # Keep only Form 8871 organization records for FL
                    # Guard: some chunks may have fewer columns (e.g. H header row only)
                    if chunk.shape[1] <= 11:
                        continue
                    mask = (
                        (chunk.iloc[:, 0].str.strip() == "1")
                        & (chunk.iloc[:, 1].str.strip() == "8871")
                        & (chunk.iloc[:, 11].str.strip().str.upper() == "FL")
                    )
                    filtered = chunk[mask]
                    if not filtered.empty:
                        chunks.append(filtered[[6, 7, 11]].rename(columns={6: "irs_ein", 7: "irs_org_name", 11: "state"}))

            if not chunks:
                print("  IRS Form 8871: no FL organizations found")
                return pd.DataFrame()

            df = pd.concat(chunks, ignore_index=True).fillna("")

    except Exception as e:
        print(f"  WARNING: Could not parse IRS zip: {e}")
        return pd.DataFrame()

    df["irs_ein"]      = df["irs_ein"].str.strip().str.zfill(9)
    df["irs_org_name"] = df["irs_org_name"].str.strip()
    df["norm_name"]    = df["irs_org_name"].apply(norm)

    print(f"  IRS Form 8871: {len(df):,} FL organizations loaded")
    return df[["irs_ein", "irs_org_name", "norm_name"]].drop_duplicates(subset=["norm_name"])


def _find_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Return the first candidate column name that exists in df."""
    for c in candidates:
        if c in df.columns:
            return c
    # Try case-insensitive
    lower_map = {col.lower(): col for col in df.columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


# ── Step 4: Fuzzy match stubs against FEC + IRS ───────────────────────────────

def fuzzy_match(query_norm: str, index_norms: list[str]) -> tuple[int, float]:
    """
    Return (best_index, best_score) for query_norm against index_norms list.
    Uses token_sort_ratio. Returns (-1, 0) if nothing beats threshold.
    """
    best_score = 0
    best_idx   = -1
    for i, candidate in enumerate(index_norms):
        score = fuzz.token_sort_ratio(query_norm, candidate)
        if score > best_score:
            best_score = score
            best_idx   = i
    if best_score >= MATCH_THRESHOLD:
        return best_idx, best_score
    return -1, 0


def match_stubs(
    stubs_df: pd.DataFrame,
    fec_cm: pd.DataFrame,
    fec_webk: pd.DataFrame,
    irs_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    For each 527-type stub: try FEC match first, then IRS fallback.
    Returns stubs_df with fec_* and irs_8871_* columns added/updated.
    """
    # Build normalized name lists for fast iteration
    fec_norms = fec_cm["norm_name"].tolist() if not fec_cm.empty else []
    irs_norms = irs_df["norm_name"].tolist() if not irs_df.empty else []

    # Build webk lookup by CMTE_ID
    if not fec_webk.empty:
        webk_lookup = fec_webk.set_index("CMTE_ID").to_dict("index")
    else:
        webk_lookup = {}

    # New columns to populate
    new_cols = {
        "fec_committee_id": "",
        "fec_name":         "",
        "fec_match_score":  0,
        "fec_total_receipts": None,
        "fec_total_disb":   None,
        "fec_latest_year":  None,
        "fec_source":       "",
        "irs_8871_ein":     "",
        "irs_8871_name":    "",
        "irs_8871_score":   0,
    }
    for col, default in new_cols.items():
        if col not in stubs_df.columns:
            stubs_df[col] = default

    fec_matched = 0
    irs_matched = 0

    for idx, row in stubs_df.iterrows():
        if row.get("stub_type", "") != "527":
            continue

        org_name = str(row["org_name"]).strip()
        query    = norm(org_name)

        # ── FEC committee match ──────────────────────────────────────────────
        if fec_norms:
            fi, fscore = fuzzy_match(query, fec_norms)
        else:
            fi, fscore = -1, 0

        if fi >= 0:
            fec_row     = fec_cm.iloc[fi]
            cmte_id     = fec_row["CMTE_ID"]
            fec_nm      = fec_row["CMTE_NM"]
            cycle       = int(fec_row["_cycle"])

            # Financial totals from webk
            fin = webk_lookup.get(cmte_id, {})
            receipts = fin.get("fec_total_receipts")
            disb     = fin.get("fec_total_disb")
            lat_yr   = fin.get("fec_latest_year", cycle)

            stubs_df.at[idx, "fec_committee_id"]   = str(cmte_id or "")
            stubs_df.at[idx, "fec_name"]            = str(fec_nm or "")
            stubs_df.at[idx, "fec_match_score"]     = str(int(fscore))
            stubs_df.at[idx, "fec_total_receipts"]  = str(receipts) if receipts is not None else ""
            stubs_df.at[idx, "fec_total_disb"]      = str(disb) if disb is not None else ""
            stubs_df.at[idx, "fec_latest_year"]     = str(safe_int(lat_yr) or "")
            stubs_df.at[idx, "fec_source"]          = "bulk_cm"
            fec_matched += 1

        # ── IRS fallback (only if no FEC match) ─────────────────────────────
        elif irs_norms:
            ii, iscore = fuzzy_match(query, irs_norms)
            if ii >= 0:
                irs_row = irs_df.iloc[ii]
                stubs_df.at[idx, "irs_8871_ein"]  = str(irs_row.get("irs_ein", "") or "")
                stubs_df.at[idx, "irs_8871_name"] = str(irs_row.get("irs_org_name", "") or "")
                stubs_df.at[idx, "irs_8871_score"] = str(int(iscore))
                irs_matched += 1

    total_527 = (stubs_df["stub_type"] == "527").sum()
    print(f"\n  Match summary (527-type stubs only):")
    print(f"    Total 527 stubs:        {total_527:,}")
    print(f"    Matched via FEC bulk:   {fec_matched:,}")
    print(f"    Matched via IRS 8871:   {irs_matched:,}")
    print(f"    Unmatched:              {total_527 - fec_matched - irs_matched:,}")

    return stubs_df


# ── Step 5: ALTER shadow_orgs and upsert ──────────────────────────────────────

ALTER_COLS = """
ALTER TABLE shadow_orgs
  ADD COLUMN IF NOT EXISTS fec_source           TEXT,
  ADD COLUMN IF NOT EXISTS fec_committee_id     TEXT,
  ADD COLUMN IF NOT EXISTS fec_name             TEXT,
  ADD COLUMN IF NOT EXISTS fec_match_score      INTEGER,
  ADD COLUMN IF NOT EXISTS fec_total_receipts   NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS fec_total_disb       NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS fec_latest_year      INTEGER,
  ADD COLUMN IF NOT EXISTS irs_8871_ein         TEXT,
  ADD COLUMN IF NOT EXISTS irs_8871_name        TEXT,
  ADD COLUMN IF NOT EXISTS irs_8871_score       INTEGER;
"""


def upsert_to_supabase(stubs_df: pd.DataFrame) -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("  WARNING: SUPABASE_DB_URL not set — skipping Supabase upsert")
        return

    con = psycopg2.connect(db_url)
    con.autocommit = True
    cur = con.cursor()
    try:
        cur.execute(ALTER_COLS)
        print("  shadow_orgs columns added/verified")

        # Only upsert rows that have at least one new match
        matched_mask = (
            stubs_df["fec_committee_id"].fillna("").astype(str).str.strip().ne("")
            | stubs_df["irs_8871_ein"].fillna("").astype(str).str.strip().ne("")
        )
        to_upsert = stubs_df[matched_mask].copy()

        if to_upsert.empty:
            print("  No matched rows to upsert.")
            return

        tuples = []
        for _, r in to_upsert.iterrows():
            raw_name = str(r.get("org_name") or "").strip()
            fec_name = str(r.get("fec_name") or "").strip()
            # org_name is NOT NULL in shadow_orgs — fall back to FEC match name if stub is empty
            resolved_name = raw_name or fec_name or str(r.get("org_slug") or "").strip()
            tuples.append((
                slugify(resolved_name) if not str(r.get("org_slug") or "").strip() else str(r.get("org_slug") or "").strip(),
                resolved_name,
                r.get("fec_source") or None,
                r.get("fec_committee_id") or None,
                fec_name or None,
                safe_int(r.get("fec_match_score")),
                safe_float(r.get("fec_total_receipts")),
                safe_float(r.get("fec_total_disb")),
                safe_int(r.get("fec_latest_year")),
                r.get("irs_8871_ein") or None,
                r.get("irs_8871_name") or None,
                safe_int(r.get("irs_8871_score")),
            ))

        execute_values(
            cur,
            """
            INSERT INTO shadow_orgs (
                org_slug, org_name,
                fec_source, fec_committee_id, fec_name, fec_match_score,
                fec_total_receipts, fec_total_disb, fec_latest_year,
                irs_8871_ein, irs_8871_name, irs_8871_score
            )
            VALUES %s
            ON CONFLICT (org_slug) DO UPDATE SET
                fec_source         = EXCLUDED.fec_source,
                fec_committee_id   = EXCLUDED.fec_committee_id,
                fec_name           = EXCLUDED.fec_name,
                fec_match_score    = EXCLUDED.fec_match_score,
                fec_total_receipts = EXCLUDED.fec_total_receipts,
                fec_total_disb     = EXCLUDED.fec_total_disb,
                fec_latest_year    = EXCLUDED.fec_latest_year,
                irs_8871_ein       = EXCLUDED.irs_8871_ein,
                irs_8871_name      = EXCLUDED.irs_8871_name,
                irs_8871_score     = EXCLUDED.irs_8871_score,
                updated_at         = NOW()
            """,
            tuples,
        )
        print(f"  Upserted {len(tuples):,} rows → shadow_orgs")

    finally:
        cur.close()
        con.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 96b: Match FL 527 Stubs via FEC + IRS Bulk Downloads ===\n")

    if not STUBS_CSV.exists():
        print(f"ERROR: {STUBS_CSV} not found. Run script 92 first.")
        return 1

    stubs_df = pd.read_csv(STUBS_CSV, dtype=str).fillna("")
    total_stubs = len(stubs_df)
    stubs_527   = (stubs_df["stub_type"] == "527").sum()
    print(f"Loaded {total_stubs:,} stub orgs ({stubs_527:,} are 527-type)\n")

    # Step 1: FEC committee master index
    print("Step 1: Building FEC committee master index (2020-2026) ...")
    fec_cm = build_fec_cm_index(force)
    print()

    # Step 2: FEC PAC summary financials
    print("Step 2: Building FEC PAC/party financial summary index ...")
    fec_webk = build_fec_webk_index(force)
    print()

    # Step 3: IRS Form 8871 index
    print("Step 3: Building IRS Form 8871 index ...")
    irs_df = build_irs_index(force)
    print()

    # Step 4: Fuzzy match stubs
    print("Step 4: Fuzzy-matching 527 stubs (threshold=78) ...")
    stubs_df = match_stubs(stubs_df, fec_cm, fec_webk, irs_df)
    print()

    # Step 5: Save updated CSV
    print("Step 5: Saving updated CSV ...")
    stubs_df.to_csv(STUBS_CSV, index=False)
    print(f"  Saved {len(stubs_df):,} rows → {STUBS_CSV.name}")
    print()

    # Step 6: Upsert to Supabase
    print("Step 6: Upserting to Supabase ...")
    upsert_to_supabase(stubs_df)
    print()

    # Summary of top FEC matches by receipts
    has_receipts = stubs_df[stubs_df["fec_total_receipts"].apply(safe_float).notna()].copy()
    if not has_receipts.empty:
        has_receipts["_rec"] = has_receipts["fec_total_receipts"].apply(safe_float)
        top = has_receipts.nlargest(10, "_rec")
        total_dark = has_receipts["_rec"].sum()
        print(f"  Total FEC receipts across matched orgs: ${total_dark:,.0f}")
        print(f"  Top matches by FEC receipts:")
        for _, r in top.iterrows():
            print(f"    {str(r['org_name'])[:50]:50s}  ${r['_rec']:>12,.0f}")

    print("\n=== DONE ===")
    print(f"CSV:  {STUBS_CSV}")
    print(f"FEC cache:  {FEC_DIR}")
    print(f"IRS cache:  {IRS_CACHE_ZIP}")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
