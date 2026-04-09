# scripts/_scraper_lib.py
"""
Internal shared library for scripts 03 and 04.
Handles CGI probe, pagination, manifest tracking, and retry logic.
Not meant to be run directly.
"""

import json
import logging
import sys
import time
from datetime import datetime
from io import StringIO
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    REQUEST_DELAY_SEC, REQUEST_TIMEOUT, MAX_RETRIES,
    PAGE_ROW_LIMIT, FL_ENCODING, LOG_DIR, CONTRIB_SEL,
)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def setup_logging(script_name: str) -> logging.Logger:
    """
    Configure a logger that writes to both the terminal and a timestamped log file.
    Returns the logger.
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"{script_name}_{timestamp}.log"

    logger = logging.getLogger(script_name)
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(message)s", datefmt="%H:%M:%S")

    # File handler — full DEBUG output
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    # Console handler — INFO and above
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    logger.info(f"Log file: {log_path}")
    return logger


# ---------------------------------------------------------------------------
# Manifest helpers
# ---------------------------------------------------------------------------

def load_manifest(path: Path) -> dict:
    """Read manifest JSON if it exists; return empty dict otherwise."""
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_manifest(manifest: dict, path: Path) -> None:
    """Write manifest atomically using a .tmp file then rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# CGI probe — discovers working parameter set before the main loop
# ---------------------------------------------------------------------------

# Candidate parameter sets to try (in order). The probe picks the first one
# whose response looks like valid tab-delimited data or an HTML data table.
# {acct} and {comname} are substituted at probe time.
_PROBE_VARIANTS = [
    # TreFin.exe — try tab-delimited output first (queryoutput=2 or tab)
    {"account": "{acct}", "comname": "{comname}", "CanCom": "Comm", "seqnum": "0",
     "queryfor": "1", "queryorder": "DAT", "queryoutput": "2", "query": "Submit+Query+Now"},
    {"account": "{acct}", "comname": "{comname}", "CanCom": "Comm", "seqnum": "0",
     "queryfor": "1", "queryorder": "DAT", "queryoutput": "tab", "query": "Submit+Query+Now"},
    {"account": "{acct}", "comname": "{comname}", "CanCom": "Comm", "seqnum": "0",
     "queryfor": "1", "queryorder": "DAT", "queryoutput": "3", "query": "Submit+Query+Now"},
    # HTML fallback (queryoutput=1) — will be parsed with read_html
    {"account": "{acct}", "comname": "{comname}", "CanCom": "Comm", "seqnum": "0",
     "queryfor": "1", "queryorder": "DAT", "queryoutput": "1", "query": "Submit+Query+Now"},
]

# Column name mapping from TreFin.exe HTML table → our internal schema
_HTML_COL_MAP = {
    "rpt yr":           "report_year",
    "rpt type":         "report_type",
    "date":             "contribution_date",
    "amount":           "amount",
    "contributor name": "contributor_name",
    "address":          "contributor_address",
    "city state zip":   "contributor_city_state_zip",
    "occupation":       "contributor_occupation",
    "type":             "type_code",
    "in kind":          "in_kind_description",
}


def _looks_like_tsv(text: str) -> bool:
    """Return True if the response text looks like a tab-delimited data file."""
    if not text or not text.strip():
        return False
    first_line = text.strip().splitlines()[0]
    return "\t" in first_line and not first_line.strip().startswith("<")


def _looks_like_html_data_table(text: str) -> bool:
    """Return True if the response is HTML containing a contributions data table."""
    if not text or not text.strip():
        return False
    lower = text.lower()
    return "<table" in lower and (
        "contributor" in lower or "amount" in lower or "campaign contributions" in lower
    )


def warmup_session(session: requests.Session, logger: logging.Logger) -> None:
    """
    GET TreSel.exe (the committee search page) to establish session cookies
    before POSTing to TreFin.exe. Required because TreFin.exe checks Referer
    and ASPSESSIONID cookies set by TreSel.exe.
    """
    try:
        resp = session.get(CONTRIB_SEL, timeout=15)
        logger.debug(f"  Session warmup: GET {CONTRIB_SEL} → {resp.status_code}")
    except requests.RequestException as e:
        logger.debug(f"  Session warmup failed (non-fatal): {e}")


def probe_cgi_endpoint(
    cgi_url: str,
    probe_acct: str,
    probe_comname: str,
    logger: logging.Logger,
    timeout: int = REQUEST_TIMEOUT,
) -> tuple[dict, str]:
    """
    Try a series of parameter variants against cgi_url using probe_acct/probe_comname.
    Returns (params_template, response_format) where response_format is 'tsv' or 'html'.
    Raises RuntimeError if no variant works.
    """
    logger.info(f"Probing CGI endpoint: {cgi_url}")
    logger.info(f"  Using probe account: {probe_acct!r}  name: {probe_comname!r}")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": CONTRIB_SEL,
    })
    warmup_session(session, logger)

    for i, variant_template in enumerate(_PROBE_VARIANTS, 1):
        params = {
            k: v.replace("{acct}", probe_acct).replace("{comname}", probe_comname)
            for k, v in variant_template.items()
        }
        logger.debug(f"  Variant {i}: {params}")

        try:
            resp = session.post(cgi_url, data=params, timeout=timeout)

            if resp.status_code == 502:
                logger.warning(
                    "  The FL DOE server returned 502 Bad Gateway — the backend CGI is down.\n"
                    "  This is a server-side outage, not a problem with this script.\n"
                    "  Wait a few hours and try again."
                )
                raise RuntimeError("FL DOE CGI server is returning 502 Bad Gateway (server outage)")

            resp.raise_for_status()
            text = resp.content.decode(FL_ENCODING, errors="replace")

            if _looks_like_tsv(text):
                logger.info(f"  Probe succeeded with variant {i} (TSV format).")
                lines = text.strip().splitlines()[:3]
                logger.info("  First 3 lines of response:")
                for line in lines:
                    logger.info(f"    {line[:120]}")
                return variant_template, "tsv"

            elif _looks_like_html_data_table(text):
                logger.info(f"  Probe succeeded with variant {i} (HTML table format).")
                logger.info("  Note: HTML mode has fewer columns than TSV (no occupation/type_code).")
                return variant_template, "html"

            elif text.strip().startswith("<"):
                try:
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(text, "lxml")
                    body_text = soup.get_text(separator=" ", strip=True)[:300]
                    logger.debug(f"  Variant {i} returned HTML (no data table): {body_text}")
                except Exception:
                    logger.debug(f"  Variant {i} returned HTML (could not parse)")
            else:
                logger.debug(f"  Variant {i} response not recognized: {text[:100]!r}")

        except RuntimeError:
            raise
        except requests.RequestException as e:
            logger.debug(f"  Variant {i} request failed: {e}")

        time.sleep(0.5)

    raise RuntimeError(
        f"Could not connect to CGI endpoint at {cgi_url}.\n"
        "None of the known parameter variants returned usable data.\n"
        "Possible causes:\n"
        "  1. The site is temporarily down — try again later.\n"
        "  2. The URL or parameters changed — check config.py.\n"
        "  3. Your IP is being rate-limited — wait a few minutes.\n"
        "Use browser dev tools (F12 → Network tab) on the FL DOE site to inspect\n"
        "the exact request, then update CONTRIB_CGI and probe variants in config.py."
    )


# ---------------------------------------------------------------------------
# Page fetching with retry
# ---------------------------------------------------------------------------

def fetch_page(
    cgi_url: str,
    acct_num: str,
    comname: str,
    row_offset: int,
    cgi_params_template: dict,
    session: requests.Session,
    logger: logging.Logger,
    delay: float = REQUEST_DELAY_SEC,
    timeout: int = REQUEST_TIMEOUT,
    max_retries: int = MAX_RETRIES,
) -> str:
    """
    POST to cgi_url for acct_num/comname starting at row_offset (seqnum).
    Returns raw response text.
    Retries up to max_retries times with exponential backoff.
    Raises RuntimeError after all retries are exhausted.
    """
    params = {
        k: v.replace("{acct}", acct_num).replace("{comname}", comname or "")
        for k, v in cgi_params_template.items()
    }
    # TreFin.exe uses seqnum for pagination offset
    params["seqnum"] = str(row_offset)

    for attempt in range(1, max_retries + 1):
        try:
            resp = session.post(cgi_url, data=params, timeout=timeout)
            resp.raise_for_status()
            text = resp.content.decode(FL_ENCODING, errors="replace")
            time.sleep(delay)
            return text
        except requests.RequestException as e:
            logger.warning(f"    fetch attempt {attempt}/{max_retries} failed: {e}")
            if attempt == max_retries:
                raise RuntimeError(f"Failed to fetch page (offset={row_offset}) after {max_retries} attempts: {e}")
            time.sleep(delay * attempt)

    return ""  # unreachable


# ---------------------------------------------------------------------------
# Page parsing — TSV and HTML
# ---------------------------------------------------------------------------

def parse_html_page(raw_text: str) -> pd.DataFrame:
    """
    Parse an HTML response from TreFin.exe into a DataFrame.
    Uses pandas read_html to find the contributions table, then normalizes
    column names to match our internal schema via _HTML_COL_MAP.
    Returns empty DataFrame if no usable table is found.
    """
    if not raw_text or not raw_text.strip():
        return pd.DataFrame()
    try:
        tables = pd.read_html(StringIO(raw_text), flavor="lxml")
    except Exception:
        try:
            tables = pd.read_html(StringIO(raw_text))
        except Exception:
            return pd.DataFrame()

    for tbl in tables:
        cols_lower = [str(c).lower().strip() for c in tbl.columns]
        if any(k in cols_lower for k in ("amount", "contributor name", "date")):
            # Normalize column names
            tbl.columns = [str(c).lower().strip() for c in tbl.columns]
            rename = {k: v for k, v in _HTML_COL_MAP.items() if k in tbl.columns}
            tbl = tbl.rename(columns=rename)
            return tbl.astype(str).replace("nan", "")
    return pd.DataFrame()


def parse_tsv_page(raw_text: str, expect_header: bool) -> pd.DataFrame:
    """
    Parse a raw tab-delimited string into a DataFrame.

    - expect_header=True  (first page): includes the header row.
    - expect_header=False (subsequent pages): strips the repeated header row.
    - Returns an empty DataFrame if the response is HTML, empty, or malformed.
    """
    if not raw_text or not raw_text.strip():
        return pd.DataFrame()

    stripped = raw_text.strip()

    # HTML error page → empty
    if stripped.startswith("<"):
        return pd.DataFrame()

    lines = stripped.splitlines()

    if not expect_header and len(lines) > 1:
        # Skip the repeated header on pages 2+
        lines = lines[1:]

    if not lines:
        return pd.DataFrame()

    try:
        df = pd.read_csv(
            StringIO("\n".join(lines)),
            sep="\t",
            dtype=str,
            encoding_errors="replace",
            on_bad_lines="warn",
        )
        df.columns = [c.strip() for c in df.columns]
        return df
    except Exception:
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Main pagination loop — used by both scripts 03 and 04
# ---------------------------------------------------------------------------

def download_all_pages(
    cgi_url: str,
    acct_num: str,
    comname: str,
    dest_path: Path,
    cgi_params_template: dict,
    response_format: str,
    session: requests.Session,
    manifest: dict,
    manifest_path: Path,
    logger: logging.Logger,
    force: bool = False,
) -> dict:
    """
    Download ALL pages of data for one committee from cgi_url.
    Writes combined tab-delimited output to dest_path.
    response_format: 'tsv' or 'html' (determined by probe_cgi_endpoint).
    Updates and saves the manifest after each committee.
    Returns the manifest entry dict for acct_num.
    """
    # Skip if already complete (unless force=True)
    if not force and manifest.get(acct_num, {}).get("status") == "complete":
        logger.debug(f"  {acct_num}: already complete in manifest, skipping")
        return manifest[acct_num]

    all_frames: list[pd.DataFrame] = []
    row_offset = 0
    page_num = 0

    while True:
        logger.debug(f"  {acct_num}: fetching page {page_num + 1} (seqnum={row_offset})")
        try:
            raw = fetch_page(
                cgi_url, acct_num, comname, row_offset,
                cgi_params_template, session, logger,
            )
        except RuntimeError as e:
            entry = {
                "status": "error",
                "error": str(e),
                "last_updated": datetime.now().isoformat(),
            }
            manifest[acct_num] = entry
            save_manifest(manifest, manifest_path)
            raise

        if response_format == "html":
            page_df = parse_html_page(raw)
        else:
            page_df = parse_tsv_page(raw, expect_header=(page_num == 0))

        if page_df.empty:
            break  # no data (committee has no records, or last page was exactly PAGE_ROW_LIMIT)

        all_frames.append(page_df)
        rows_this_page = len(page_df)
        logger.debug(f"  {acct_num}: page {page_num + 1} → {rows_this_page} rows")

        if rows_this_page < PAGE_ROW_LIMIT:
            break  # last page (partial)

        row_offset += PAGE_ROW_LIMIT
        page_num += 1

    # Write output
    if all_frames:
        combined = pd.concat(all_frames, ignore_index=True)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        combined.to_csv(dest_path, sep="\t", index=False, encoding=FL_ENCODING)
        entry = {
            "status": "complete",
            "rows": len(combined),
            "pages": page_num + 1,
            "last_updated": datetime.now().isoformat(),
        }
    else:
        entry = {
            "status": "empty",
            "rows": 0,
            "pages": 0,
            "last_updated": datetime.now().isoformat(),
        }

    manifest[acct_num] = entry
    save_manifest(manifest, manifest_path)
    return entry
