# scripts/check_server.py
"""
Quick check: is the FL DOE contribution/expenditure CGI server up?

Run this before starting a full pipeline to confirm the server is responding.
If this shows "UP", you're good to run 06_orchestrate.py.
If it shows "DOWN (502)", wait a few hours and try again — it's a state government
server and will come back up on its own.

Usage (from project root, with .venv activated):
    python scripts/check_server.py
"""

import sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import CONTRIB_CGI, CONTRIB_SEL, EXPEND_CGI

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": CONTRIB_SEL,
}

# TreFin.exe params — same as what the browser POSTs
_TEST_PARAMS = {
    "account":    "4700",
    "comname":    "Republican Party of Florida",
    "CanCom":     "Comm",
    "seqnum":     "0",
    "queryfor":   "1",
    "queryorder": "DAT",
    "queryoutput": "1",
    "query":      "Submit+Query+Now",
}


def check(label: str, url: str) -> bool:
    try:
        s = requests.Session()
        s.headers.update(_HEADERS)
        s.get(CONTRIB_SEL, timeout=10)  # warmup — establish session cookies
        r = s.post(url, data=_TEST_PARAMS, timeout=20)
        if r.status_code == 502:
            print(f"  {label}: DOWN (502 Bad Gateway — server outage, not a code problem)")
            return False
        elif r.status_code != 200:
            print(f"  {label}: UNEXPECTED STATUS {r.status_code}")
            return False
        text = r.content.decode("latin-1", errors="replace")
        lower = text.lower()
        if "<table" in lower and ("contributor" in lower or "amount" in lower):
            print(f"  {label}: UP — data table received")
            return True
        elif "\t" in (text.splitlines()[0] if text.strip() else ""):
            print(f"  {label}: UP — tab-delimited data received")
            return True
        else:
            print(f"  {label}: UP but response format unexpected (first 100 chars: {text[:100]!r})")
            return True
    except Exception as e:
        print(f"  {label}: ERROR — {e}")
        return False


def main() -> int:
    print("Checking FL DOE CGI server status...\n")
    contrib_up = check("Contributions CGI (TreFin.exe)", CONTRIB_CGI)
    expend_up  = check("Expenditures CGI  (expend.exe) ", EXPEND_CGI)

    print()
    if contrib_up:
        print("Contributions CGI is UP — pipeline can run.")
        if not expend_up:
            print("Expenditures CGI is DOWN (502) — known issue, skip script 04/07.")
        return 0
    else:
        print("Contributions CGI is DOWN — cannot scrape. Wait and try again.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
