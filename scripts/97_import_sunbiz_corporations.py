"""
Script 97: Import FL Division of Corporations (Sunbiz) bulk data.

Downloads the quarterly full-extract from sftp.floridados.gov, parses the
1440-char fixed-length ASCII format, loads to Supabase fl_corporations table,
then fuzzy-matches entity_name against our donors table to enrich donors with
corporate structure data.

SFTP:
  Host:     sftp.floridados.gov
  User:     Public
  Password: PubAccess1845!
  Quarterly full files live in folders named Jan/, Apr/, Jul/, Oct/ (or similar)
  Use the most recent one.

Format spec: https://dos.sunbiz.org/data-definitions/cor.html
  Total record length: 1440 chars (plus newline)
  Dates are MMDDYYYY (8 chars)
  Up to 6 officers per record (128 bytes each, starting at byte 669)

Outputs:
  data/raw/sunbiz/<filename>          — raw downloaded file (cached)
  data/processed/fl_corporations.csv  — parsed records

Supabase tables:
  fl_corporations         — one row per FL corporation
  donors (enriched)       — corp_number, corp_ein, corp_status, corp_match_score added

Usage:
  python scripts/97_import_sunbiz_corporations.py
  python scripts/97_import_sunbiz_corporations.py --force    # re-download even if cached
  python scripts/97_import_sunbiz_corporations.py --dry-run  # parse + match, no DB writes

Requirements (not yet in requirements.txt):
  paramiko>=3.4.0   — SFTP client; install with: pip install paramiko
"""

import csv
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, RAW_DIR, PROJECT_ROOT

# ── Paths ─────────────────────────────────────────────────────────────────────

SUNBIZ_RAW_DIR = RAW_DIR / "sunbiz"
OUTPUT_CSV     = PROCESSED_DIR / "fl_corporations.csv"

# ── SFTP Config ───────────────────────────────────────────────────────────────

SFTP_HOST = "sftp.floridados.gov"
SFTP_USER = "Public"
SFTP_PASS = "PubAccess1845!"

# Quarterly folder names to probe (most → least recent)
SFTP_QUARTERLY_DIRS = ["Apr", "Jan", "Jul", "Oct"]

# ── DB ────────────────────────────────────────────────────────────────────────

load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

BATCH_SIZE      = 2000
FUZZY_THRESHOLD = 82   # token_sort_ratio — matches project-wide convention

# ── Fixed-length Record Layout ────────────────────────────────────────────────
# Source: https://dos.sunbiz.org/data-definitions/cor.html
# All offsets are 0-based (spec uses 1-based; subtract 1 from start).
# Slices are [start:end] (Python half-open).

# fmt: off
F_CORP_NUMBER        = ( 0,  12)   # Corporation document number
F_CORP_NAME          = (12, 204)   # Corporation name
F_STATUS             = (204, 205)  # A=Active, I=Inactive
F_FILING_TYPE        = (205, 220)  # DOMP/FORP/DOMLP etc.
F_ADDR1              = (220, 262)  # Principal address line 1
F_ADDR2              = (262, 304)  # Principal address line 2
F_CITY               = (304, 332)  # Principal city
F_STATE              = (332, 334)  # Principal state
F_ZIP                = (334, 344)  # Principal zip
F_COUNTRY            = (344, 346)  # Principal country
F_MAIL_ADDR1         = (346, 388)  # Mailing address line 1
F_MAIL_ADDR2         = (388, 430)  # Mailing address line 2
F_MAIL_CITY          = (430, 458)  # Mailing city
F_MAIL_STATE         = (458, 460)  # Mailing state
F_MAIL_ZIP           = (460, 470)  # Mailing zip
F_MAIL_COUNTRY       = (470, 472)  # Mailing country
F_FILE_DATE          = (472, 480)  # Formation filing date (MMDDYYYY)
F_FEI_NUMBER         = (480, 494)  # Federal EIN
F_MORE_OFFICERS_FLAG = (494, 495)  # Y if >6 officers
F_LAST_TX_DATE       = (495, 503)  # Date of last filing (MMDDYYYY)
F_STATE_COUNTRY      = (503, 505)  # State/country of incorporation
F_REPORT_YEAR1       = (505, 509)  # Most recent annual report year
# F_FILLER1          = (509, 510)
F_REPORT_DATE1       = (510, 518)  # Most recent annual report date
F_REPORT_YEAR2       = (518, 522)
# F_FILLER2          = (522, 523)
F_REPORT_DATE2       = (523, 531)
F_REPORT_YEAR3       = (531, 535)
# F_FILLER3          = (535, 536)
F_REPORT_DATE3       = (536, 544)
F_RA_NAME            = (544, 586)  # Registered agent name
F_RA_TYPE            = (586, 587)  # P=Person, C=Corporation
F_RA_ADDR            = (587, 629)  # RA street address
F_RA_CITY            = (629, 657)  # RA city
F_RA_STATE           = (657, 659)  # RA state
F_RA_ZIP             = (659, 668)  # RA zip+4

# Officer blocks: 6 officers × 128 bytes each, starting at byte 668
# Within each 128-byte block (0-based offsets within block):
OFFICER_BLOCK_START  = 668
OFFICER_BLOCK_SIZE   = 128
OFFICER_COUNT        = 6

# Within each officer block:
OFF_TITLE   = ( 0,   4)   # Title code (P/T/C/V/S/D)
OFF_TYPE    = ( 4,   5)   # P=Person, C=Corporation
OFF_NAME    = ( 5,  47)   # Officer name
OFF_ADDR    = (47,  89)   # Street address
OFF_CITY    = (89, 117)   # City
OFF_STATE   = (117, 119)  # State
OFF_ZIP     = (119, 128)  # Zip+4
# fmt: on

OFFICER_TITLE_MAP = {
    "P": "President",
    "T": "Treasurer",
    "C": "Chairman",
    "V": "Vice President",
    "S": "Secretary",
    "D": "Director",
    "R": "Registered Agent",
    "M": "Manager",
    "G": "General Partner",
    "L": "Limited Partner",
    "A": "Authorized Member",
}


# ── Name normalization (matches project convention in scripts 92/94) ───────────

_PUNCT = re.compile(r"[^A-Z0-9\s]")
_CORP_SUFFIXES = re.compile(
    r"\b(LLC|INC|CORP|CORPORATION|LTD|LP|LLP|CO|COMPANY|GROUP|HOLDINGS|PARTNERS"
    r"|ENTERPRISES|SERVICES|SOLUTIONS|ASSOCIATES|CONSULTING|TECHNOLOGIES|SYSTEMS"
    r"|MANAGEMENT|FOUNDATION|TRUST|FUND|PA|PL|PLC)\b\.?",
    re.IGNORECASE,
)


def norm(s: str) -> str:
    return " ".join(_PUNCT.sub(" ", str(s).upper()).split())


def norm_strip_corp(s: str) -> str:
    n = norm(s)
    return " ".join(_CORP_SUFFIXES.sub("", n).split())


# ── Date parsing ──────────────────────────────────────────────────────────────

def parse_date(raw: str) -> date | None:
    """Parse MMDDYYYY → date object. Returns None for blank/invalid."""
    s = raw.strip()
    if len(s) != 8 or s == "00000000":
        return None
    try:
        return datetime.strptime(s, "%m%d%Y").date()
    except ValueError:
        return None


# ── Record parser ─────────────────────────────────────────────────────────────

def _field(line: str, offsets: tuple[int, int]) -> str:
    """Extract and strip a field from a fixed-width line."""
    return line[offsets[0]:offsets[1]].strip()


def parse_record(line: str) -> dict | None:
    """
    Parse one 1440-char fixed-width line into a dict.
    Returns None if the line is too short or the corp number is blank.
    """
    if len(line) < 1436:
        return None

    corp_number = _field(line, F_CORP_NUMBER)
    if not corp_number:
        return None

    # Principal address — combine addr1 + addr2
    addr1 = _field(line, F_ADDR1)
    addr2 = _field(line, F_ADDR2)
    address = ", ".join(p for p in [addr1, addr2] if p) or None

    # Officers
    officers = []
    for i in range(OFFICER_COUNT):
        block_start = OFFICER_BLOCK_START + i * OFFICER_BLOCK_SIZE
        block_end   = block_start + OFFICER_BLOCK_SIZE
        if block_end > len(line):
            break
        block = line[block_start:block_end]

        title_code = block[OFF_TITLE[0]:OFF_TITLE[1]].strip()
        name       = block[OFF_NAME[0]:OFF_NAME[1]].strip()

        if not name:
            continue

        officers.append({
            "title_code": title_code,
            "title":      OFFICER_TITLE_MAP.get(title_code[:1], title_code),
            "type":       "Corporation" if block[OFF_TYPE[0]:OFF_TYPE[1]].strip() == "C" else "Person",
            "name":       name,
            "address":    block[OFF_ADDR[0]:OFF_ADDR[1]].strip() or None,
            "city":       block[OFF_CITY[0]:OFF_CITY[1]].strip() or None,
            "state":      block[OFF_STATE[0]:OFF_STATE[1]].strip() or None,
            "zip":        block[OFF_ZIP[0]:OFF_ZIP[1]].strip() or None,
        })

    return {
        "corp_number":         corp_number,
        "entity_name":         _field(line, F_CORP_NAME) or None,
        "status":              _field(line, F_STATUS) or None,
        "filing_type":         _field(line, F_FILING_TYPE) or None,
        "ein":                 _field(line, F_FEI_NUMBER) or None,
        "file_date":           parse_date(_field(line, F_FILE_DATE)),
        "last_transaction_date": parse_date(_field(line, F_LAST_TX_DATE)),
        "address":             address,
        "city":                _field(line, F_CITY) or None,
        "state":               _field(line, F_STATE) or None,
        "zip":                 _field(line, F_ZIP) or None,
        "more_officers":       _field(line, F_MORE_OFFICERS_FLAG) == "Y",
        "officers":            officers,
    }


# ── SFTP download ─────────────────────────────────────────────────────────────

def find_and_download(force: bool = False) -> Path:
    """
    Connect to the Sunbiz SFTP, find the most recent quarterly full file,
    and download it to data/raw/sunbiz/.

    Returns the local Path to the downloaded file.
    Skips download if the file already exists and force=False.
    """
    try:
        import paramiko
    except ImportError:
        sys.exit(
            "ERROR: paramiko is required for SFTP access.\n"
            "Install it with:  pip install paramiko\n"
            "Then re-run this script."
        )

    SUNBIZ_RAW_DIR.mkdir(parents=True, exist_ok=True)

    # Connect
    print(f"  Connecting to {SFTP_HOST} ...", flush=True)
    transport = paramiko.Transport((SFTP_HOST, 22))
    transport.connect(username=SFTP_USER, password=SFTP_PASS)
    sftp = paramiko.SFTPClient.from_transport(transport)

    try:
        # List root to understand folder structure
        root_entries = sftp.listdir(".")
        print(f"  SFTP root contents: {root_entries}", flush=True)

        # Probe quarterly folders in priority order
        target_path  = None
        target_local = None

        for folder in SFTP_QUARTERLY_DIRS:
            try:
                folder_entries = sftp.listdir(folder)
            except FileNotFoundError:
                # Try case variations
                for entry in root_entries:
                    if entry.lower() == folder.lower():
                        folder = entry
                        folder_entries = sftp.listdir(folder)
                        break
                else:
                    continue

            # Look for the main corp data file (.txt or .zip)
            # Sunbiz typically names it something like "CorporationsCurrent.txt"
            # or "CORP_????Q?.txt". Pick the largest file.
            best_size = 0
            best_name = None
            for fname in folder_entries:
                try:
                    attr = sftp.stat(f"{folder}/{fname}")
                    size = attr.st_size or 0
                except Exception:
                    size = 0
                # Match known Sunbiz filename patterns
                lower = fname.lower()
                if any(k in lower for k in ("corp", "corporation", "cor")):
                    if size > best_size:
                        best_size = size
                        best_name = fname

            if best_name:
                target_path  = f"{folder}/{best_name}"
                target_local = SUNBIZ_RAW_DIR / best_name
                print(f"  Found: {target_path}  ({best_size/1e6:.1f} MB)", flush=True)
                break

        if not target_path:
            # Last resort: list root-level files
            for fname in root_entries:
                lower = fname.lower()
                if any(k in lower for k in ("corp", "corporation", "cor")):
                    try:
                        attr = sftp.stat(fname)
                        target_path  = fname
                        target_local = SUNBIZ_RAW_DIR / fname
                        print(f"  Found at root: {target_path}  ({(attr.st_size or 0)/1e6:.1f} MB)", flush=True)
                    except Exception:
                        pass
                    break

        if not target_path:
            raise FileNotFoundError(
                "Could not locate a corporation data file on the SFTP server.\n"
                f"Root entries: {root_entries}\n"
                "Check the server manually and update SFTP_QUARTERLY_DIRS if needed."
            )

        # Skip download if cached
        if target_local.exists() and not force:
            print(f"  Cached file found: {target_local.name}  (use --force to re-download)")
            return target_local

        # Download with progress
        print(f"  Downloading → {target_local} ...", flush=True)
        downloaded = [0]

        def progress(transferred, total):
            pct = (transferred / total * 100) if total else 0
            if transferred % (50 * 1024 * 1024) < 65536:  # log every ~50 MB
                print(f"    {pct:.0f}%  ({transferred/1e6:.0f} MB / {total/1e6:.0f} MB)", flush=True)

        sftp.get(target_path, str(target_local), callback=progress)
        print(f"  Download complete: {target_local.stat().st_size/1e6:.1f} MB", flush=True)

    finally:
        sftp.close()
        transport.close()

    return target_local


# ── Parse file → CSV ──────────────────────────────────────────────────────────

def parse_file(raw_path: Path) -> list[dict]:
    """
    Read the fixed-width text file and return a list of parsed record dicts.
    Prints progress every 100K records.
    Handles both raw .txt and .zip archives.
    """
    import io

    print(f"\nStep 2: Parsing {raw_path.name} ...", flush=True)

    # If the file is a zip, open the first member
    if raw_path.suffix.lower() == ".zip":
        import zipfile
        zf = zipfile.ZipFile(raw_path, "r")
        members = zf.namelist()
        print(f"  ZIP contains: {members}", flush=True)
        # Pick the largest member
        member = max(members, key=lambda m: zf.getinfo(m).file_size)
        print(f"  Extracting: {member}", flush=True)
        raw_bytes = zf.read(member)
        zf.close()
        lines_iter = io.TextIOWrapper(io.BytesIO(raw_bytes), encoding="latin-1", errors="replace")
    else:
        lines_iter = open(raw_path, encoding="latin-1", errors="replace")

    records = []
    skipped = 0
    try:
        for i, line in enumerate(lines_iter):
            line = line.rstrip("\r\n")
            if not line:
                continue

            rec = parse_record(line)
            if rec is None:
                skipped += 1
                continue

            records.append(rec)

            if len(records) % 100_000 == 0:
                print(f"  Parsed {len(records):,} records ...", flush=True)
    finally:
        if hasattr(lines_iter, "close"):
            lines_iter.close()

    print(f"  Done. {len(records):,} records parsed, {skipped:,} skipped.", flush=True)
    return records


def write_csv(records: list[dict], output: Path) -> None:
    """Write parsed records to CSV (officers serialized as JSON string)."""
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "corp_number", "entity_name", "status", "filing_type",
        "ein", "file_date", "last_transaction_date",
        "address", "city", "state", "zip",
        "more_officers", "officers",
    ]
    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for rec in records:
            row = dict(rec)
            row["officers"] = json.dumps(rec["officers"]) if rec["officers"] else "[]"
            writer.writerow(row)
    print(f"  CSV written: {output}  ({len(records):,} rows)", flush=True)


# ── Supabase: create + load fl_corporations ───────────────────────────────────

CREATE_CORPS_TABLE = """
CREATE TABLE IF NOT EXISTS fl_corporations (
    id                    SERIAL PRIMARY KEY,
    corp_number           TEXT UNIQUE NOT NULL,
    entity_name           TEXT,
    status                TEXT,
    filing_type           TEXT,
    ein                   TEXT,
    file_date             DATE,
    last_transaction_date DATE,
    address               TEXT,
    city                  TEXT,
    state                 TEXT,
    zip                   TEXT,
    more_officers         BOOLEAN DEFAULT FALSE,
    officers              JSONB,
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fl_corporations_corp_number ON fl_corporations(corp_number);
CREATE INDEX IF NOT EXISTS idx_fl_corporations_entity_name ON fl_corporations(entity_name);
CREATE INDEX IF NOT EXISTS idx_fl_corporations_ein         ON fl_corporations(ein);
CREATE INDEX IF NOT EXISTS idx_fl_corporations_status      ON fl_corporations(status);
"""


def load_corporations(records: list[dict], cur, dry_run: bool) -> int:
    """Upsert parsed corporation records into fl_corporations. Returns row count."""
    print(f"\nStep 3: Loading {len(records):,} corporations → fl_corporations ...", flush=True)

    if not dry_run:
        cur.execute(CREATE_CORPS_TABLE)

    rows = []
    for rec in records:
        rows.append((
            rec["corp_number"],
            rec["entity_name"],
            rec["status"],
            rec["filing_type"],
            rec["ein"],
            rec["file_date"],
            rec["last_transaction_date"],
            rec["address"],
            rec["city"],
            rec["state"],
            rec["zip"],
            rec["more_officers"],
            json.dumps(rec["officers"]) if rec["officers"] else "[]",
        ))

    if dry_run:
        print(f"  [dry-run] Would upsert {len(rows):,} rows → fl_corporations")
        return len(rows)

    execute_values(
        cur,
        """
        INSERT INTO fl_corporations
            (corp_number, entity_name, status, filing_type, ein,
             file_date, last_transaction_date, address, city, state, zip,
             more_officers, officers)
        VALUES %s
        ON CONFLICT (corp_number) DO UPDATE SET
            entity_name           = EXCLUDED.entity_name,
            status                = EXCLUDED.status,
            filing_type           = EXCLUDED.filing_type,
            ein                   = EXCLUDED.ein,
            file_date             = EXCLUDED.file_date,
            last_transaction_date = EXCLUDED.last_transaction_date,
            address               = EXCLUDED.address,
            city                  = EXCLUDED.city,
            state                 = EXCLUDED.state,
            zip                   = EXCLUDED.zip,
            more_officers         = EXCLUDED.more_officers,
            officers              = EXCLUDED.officers,
            updated_at            = NOW()
        """,
        rows,
        page_size=BATCH_SIZE,
    )

    print(f"  Upserted {len(rows):,} rows → fl_corporations", flush=True)
    return len(rows)


# ── Supabase: add corp columns to donors ──────────────────────────────────────

ALTER_DONORS = """
ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS corp_number     TEXT,
    ADD COLUMN IF NOT EXISTS corp_ein        TEXT,
    ADD COLUMN IF NOT EXISTS corp_status     TEXT,
    ADD COLUMN IF NOT EXISTS corp_match_score INTEGER;
"""

CREATE_DONORS_IDX = """
CREATE INDEX IF NOT EXISTS idx_donors_corp_number ON donors(corp_number);
"""


def enrich_donors(records: list[dict], cur, dry_run: bool) -> int:
    """
    Fuzzy-match fl_corporations.entity_name against donors.name in Supabase.
    Only matches corporate donors (is_corporate = TRUE or name has corp signals).
    Writes corp_number, corp_ein, corp_status, corp_match_score back to donors.
    Returns count of matched donors.
    """
    print("\nStep 4: Fuzzy-matching corporations → donors ...", flush=True)

    # ── 4a. Fetch corporate donors from Supabase ──────────────────────────────
    print("  Fetching corporate donors from Supabase ...", flush=True)
    cur.execute("""
        SELECT id, name
        FROM   donors
        WHERE  is_corporate = TRUE
           AND name IS NOT NULL
           AND name != ''
    """)
    donor_rows = cur.fetchall()

    if not donor_rows:
        # Fallback: fetch all donors and filter by heuristic (name has corp suffix)
        print("  No is_corporate=TRUE donors found — fetching all and filtering heuristically ...", flush=True)
        cur.execute("SELECT id, name FROM donors WHERE name IS NOT NULL AND name != ''")
        donor_rows = cur.fetchall()
        # Keep only names that look corporate
        corp_pat = re.compile(
            r"\b(LLC|INC|CORP|LTD|LP|LLP|CO\b|GROUP|HOLDINGS|PARTNERS|ENTERPRISES"
            r"|SERVICES|SOLUTIONS|ASSOCIATES|CONSULTING|TECHNOLOGIES|SYSTEMS"
            r"|MANAGEMENT|FOUNDATION|TRUST|FUND|PA\b|PL\b|PLC)\b",
            re.IGNORECASE,
        )
        donor_rows = [(did, dname) for did, dname in donor_rows if corp_pat.search(str(dname))]

    print(f"  {len(donor_rows):,} corporate donors to match", flush=True)

    if not donor_rows:
        print("  No corporate donors to match. Skipping enrichment.")
        return 0

    # ── 4b. Build corp lookup (norm_stripped → record) ────────────────────────
    print(f"  Building corp lookup from {len(records):,} FL corporations ...", flush=True)
    corp_lookup = []
    for rec in records:
        name = rec.get("entity_name") or ""
        if not name:
            continue
        corp_lookup.append({
            "corp_number": rec["corp_number"],
            "ein":         rec["ein"],
            "status":      rec["status"],
            "name":        name,
            "norm":        norm(name),
            "norm_stripped": norm_strip_corp(name),
        })

    # ── 4c. Match ─────────────────────────────────────────────────────────────
    print(f"  Matching {len(donor_rows):,} donors against {len(corp_lookup):,} corporations ...", flush=True)

    matches = []
    for idx, (donor_id, donor_name) in enumerate(donor_rows):
        if idx % 10_000 == 0 and idx > 0:
            print(f"    {idx:,} / {len(donor_rows):,} donors processed ...", flush=True)

        d_norm  = norm(donor_name)
        d_strip = norm_strip_corp(donor_name)

        best_score = 0
        best_corp  = None

        for corp in corp_lookup:
            # Fast exact check first
            if d_norm == corp["norm"] or d_strip == corp["norm_stripped"]:
                best_score = 100
                best_corp  = corp
                break

            score = fuzz.token_sort_ratio(d_strip, corp["norm_stripped"])
            if score > best_score and score >= FUZZY_THRESHOLD:
                best_score = score
                best_corp  = corp

        if best_corp:
            matches.append((
                best_corp["corp_number"],
                best_corp["ein"],
                best_corp["status"],
                best_score,
                donor_id,
            ))

    print(f"  Matched: {len(matches):,} donors linked to FL corporations", flush=True)

    if not matches:
        return 0

    # ── 4d. Apply ALTER TABLE + UPDATE ────────────────────────────────────────
    if dry_run:
        print(f"  [dry-run] Would write {len(matches):,} donor corp enrichments")
        # Show a sample
        print("  Sample matches (first 10):")
        cur.execute("SELECT id, name FROM donors WHERE id = ANY(%s)",
                    ([m[4] for m in matches[:10]],))
        id_to_name = {row[0]: row[1] for row in cur.fetchall()}
        for m in matches[:10]:
            print(f"    donor '{id_to_name.get(m[4], m[4])}' → corp {m[0]} ({m[1]}, score={m[3]})")
        return len(matches)

    cur.execute(ALTER_DONORS)
    cur.execute(CREATE_DONORS_IDX)

    # Bulk update via temp table for efficiency
    cur.execute("""
        CREATE TEMP TABLE _corp_enrichments (
            corp_number      TEXT,
            corp_ein         TEXT,
            corp_status      TEXT,
            corp_match_score INTEGER,
            donor_id         INTEGER
        ) ON COMMIT DROP
    """)

    execute_values(
        cur,
        "INSERT INTO _corp_enrichments VALUES %s",
        matches,
        page_size=BATCH_SIZE,
    )

    cur.execute("""
        UPDATE donors d
        SET    corp_number      = e.corp_number,
               corp_ein         = e.corp_ein,
               corp_status      = e.corp_status,
               corp_match_score = e.corp_match_score
        FROM   _corp_enrichments e
        WHERE  d.id = e.donor_id
    """)

    updated = cur.rowcount
    print(f"  Updated {updated:,} donor rows with corp data", flush=True)
    return updated


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False, dry_run: bool = False) -> int:
    print("=== Script 97: Import FL Sunbiz Corporations ===\n")
    if dry_run:
        print("  [DRY RUN] — no writes to Supabase\n")

    # ── Step 1: Download ──────────────────────────────────────────────────────
    print("Step 1: Downloading quarterly bulk file via SFTP ...", flush=True)
    raw_path = find_and_download(force=force)

    # ── Step 2: Parse ─────────────────────────────────────────────────────────
    records = parse_file(raw_path)

    if not records:
        print("ERROR: No records parsed. Check file format or SFTP download.")
        return 1

    write_csv(records, OUTPUT_CSV)

    # Active / inactive summary
    active   = sum(1 for r in records if r["status"] == "A")
    inactive = sum(1 for r in records if r["status"] == "I")
    print(f"  Active: {active:,}  |  Inactive: {inactive:,}")

    # ── Step 3 + 4: Supabase ─────────────────────────────────────────────────
    print("\nStep 3+4: Connecting to Supabase ...", flush=True)
    con = psycopg2.connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()

    try:
        corp_count  = load_corporations(records, cur, dry_run)
        donor_count = enrich_donors(records, cur, dry_run)

        if not dry_run:
            con.commit()
            print("\n  Committed.", flush=True)
        else:
            con.rollback()

    except Exception as e:
        con.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        con.close()

    print("\n=== DONE ===")
    print(f"Raw file:  {raw_path}")
    print(f"CSV:       {OUTPUT_CSV}")
    print(f"Table:     fl_corporations  ({corp_count:,} rows)")
    print(f"Donors enriched: {donor_count:,}")
    if not dry_run:
        print("\nNext: Add fl_corporations query to relevant donor/company profile pages.")
    return 0


if __name__ == "__main__":
    force   = "--force"   in sys.argv
    dry_run = "--dry-run" in sys.argv
    sys.exit(main(force=force, dry_run=dry_run))
