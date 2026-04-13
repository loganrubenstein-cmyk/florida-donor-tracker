# scripts/config.py
"""
Central configuration for the Florida campaign finance pipeline.
Edit values here to change behavior across all scripts.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# --- Raw data directories ---
RAW_DIR        = PROJECT_ROOT / "data" / "raw"
COMMITTEES_RAW = RAW_DIR / "committees"
CANDIDATES_RAW = RAW_DIR / "candidates"
CONTRIB_RAW    = RAW_DIR / "contributions"
EXPEND_RAW     = RAW_DIR / "expenditures"
TRANSFERS_RAW  = RAW_DIR / "transfers"
LOBBYIST_RAW   = RAW_DIR / "lobbyists"

# --- Processed and log directories ---
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
LOG_DIR       = PROJECT_ROOT / "data" / "logs"

# --- Download URLs ---
COMMITTEES_URL = "https://dos.elections.myflorida.com/committees/extractComList.asp"
CANDIDATES_URL = "https://dos.elections.myflorida.com/candidates/extractCanList.asp"
CONTRIB_CGI    = "https://dos.elections.myflorida.com/cgi-bin/TreFin.exe"
CONTRIB_SEL    = "https://dos.elections.myflorida.com/cgi-bin/TreSel.exe"
EXPEND_CGI     = "https://dos.elections.myflorida.com/cgi-bin/expend.exe"
TRANSFER_CGI   = "https://dos.elections.myflorida.com/cgi-bin/FundXfers.exe"
LLOB_URL       = "https://www.leg.state.fl.us/data/LLob.txt"
ELOB_URL       = "https://www.leg.state.fl.us/data/ELob.txt"

# --- HTTP behavior ---
REQUEST_DELAY_SEC = 1.5   # seconds to sleep between requests
REQUEST_TIMEOUT   = 30    # seconds before a request gives up
MAX_RETRIES       = 3     # retry attempts per failed request
PAGE_ROW_LIMIT    = 500   # rows per CGI page (FL DOE maximum)

# --- File encoding ---
FL_ENCODING = "latin-1"   # FL DOE files are not UTF-8

# --- Committee filtering ---
# Set to None to download ALL committees.
# Set to a list of type codes to restrict, e.g. ["PCO", "PAC", "ECO"].
# FL DOE type codes:
#   CCE = candidate committee
#   ECO = electioneering communications organization
#   CPO = committee of continuous existence (political org)
#   PCO = party committee organization (major/minor parties)
#   PAC = political action committee (federal PAC registered in FL)
COMMITTEE_TYPE_FILTER = None
