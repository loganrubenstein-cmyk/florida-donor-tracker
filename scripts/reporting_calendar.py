# scripts/reporting_calendar.py
"""
FL DOE 2026 Campaign Finance Reporting Calendar.

Hardcoded from official PDFs (reviewed 2026-04-06):
  - 2026-reporting-dates-pc.pdf (political committees / independent expenditure-only)
  - 2026-reporting-dates-statewide-candidates.pdf
  - 2026-reporting-dates-other-than-statewide-candidates.pdf

Exports public/data/reporting_schedule.json for the website.
Also used by check_server.py to show the next filing deadline.

Usage (from project root, with .venv activated):
    python scripts/reporting_calendar.py
"""

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

PUBLIC_DIR = PROJECT_ROOT / "public" / "data"

# ---------------------------------------------------------------------------
# Human-readable labels for report_type codes found in contributions.csv
# ---------------------------------------------------------------------------

REPORT_PERIOD_LABELS: dict[str, str] = {
    # Quarterly
    "Q4":  "Q4 Quarterly (Oct–Dec prior year)",
    "Q1":  "Q1 Quarterly (Jan–Mar)",
    "Q2":  "Q2 Quarterly (Apr–May)",
    # Pre-primary (bi-weekly leading up to Aug 18 primary)
    "P1":  "Pre-Primary Period 1 (Jun 1–12)",
    "P1A": "Pre-Primary Period 1A (Jun 13–19)",
    "P2":  "Pre-Primary Period 2 (Jun 20–26)",
    "P2A": "Pre-Primary Period 2A (Jun 27–Jul 3)",
    "P3":  "Pre-Primary Period 3 (Jul 4–10)",
    "P4":  "Pre-Primary Period 4 (Jul 11–17)",
    "P5":  "Pre-Primary Period 5 (Jul 18–24)",
    "P6":  "Pre-Primary Period 6 (Jul 25–31)",
    "P7":  "Pre-Primary Period 7 (Aug 1–13)",
    "P7A": "Pre-Primary Period 7A (Aug 14)",
    # Pre-general (bi-weekly leading up to Nov 3 general)
    "G1":  "Pre-General Period 1 (Aug 15–21)",
    "G1A": "Pre-General Period 1A (Aug 22–28)",
    "G2":  "Pre-General Period 2 (Aug 29–Sep 4)",
    "G2A": "Pre-General Period 2A (Sep 5–11)",
    "G3":  "Pre-General Period 3 (Sep 12–18)",
    "G3A": "Pre-General Period 3A (Sep 19–25)",
    "G4":  "Pre-General Period 4 (Sep 26–Oct 2)",
    "G4A": "Pre-General Period 4A (Oct 3–9)",
    "G5":  "Pre-General Period 5 (Oct 10–16)",
    "G6":  "Pre-General Period 6 (Oct 17–29)",
    # Daily reports — final week before general election
    "D1":  "Daily Report — Election Week (Oct 17–23)",
    "D2":  "Daily Report — Election Week (Oct 24)",
    "D3":  "Daily Report — Election Week (Oct 25)",
    "D4":  "Daily Report — Election Week (Oct 26)",
    "D5":  "Daily Report — Election Week (Oct 27)",
    "D6":  "Daily Report — Election Week (Oct 28)",
    # Special
    "MUC": "Multiple Uniform Contributions — Annual (Political Committees only)",
    "TR":  "Termination Report",
}

# ---------------------------------------------------------------------------
# Full 2026 deadline schedules by committee type
# Each entry: {code, cover_period, due (ISO date), label, notes}
# ---------------------------------------------------------------------------

_PC_DEADLINES = [
    # code,    cover_period,              due,          label
    ("2025 Q4", "10/1/25 – 12/31/25",   "2026-01-12", "Q4 Quarterly"),
    ("2026 Q1", "1/1/26 – 3/31/26",     "2026-04-10", "Q1 Quarterly"),
    ("2026 Q2", "4/1/26 – 5/31/26",     "2026-06-10", "Q2 Quarterly"),
    ("2025 MUC","1/1/25 – 12/31/25",    "2026-06-19", "Multiple Uniform Contributions (Annual)"),
    ("2026 P1", "6/1/26 – 6/12/26",     "2026-06-19", "Pre-Primary Period 1"),
    ("2026 P1A","6/13/26 – 6/19/26",    "2026-06-26", "Pre-Primary Period 1A"),
    ("2026 P2", "6/20/26 – 6/26/26",    "2026-07-03", "Pre-Primary Period 2"),
    ("2026 P2A","6/27/26 – 7/3/26",     "2026-07-10", "Pre-Primary Period 2A"),
    ("2026 P3", "7/4/26 – 7/10/26",     "2026-07-17", "Pre-Primary Period 3"),
    ("2026 P4", "7/11/26 – 7/17/26",    "2026-07-24", "Pre-Primary Period 4"),
    ("2026 P5", "7/18/26 – 7/24/26",    "2026-07-31", "Pre-Primary Period 5"),
    ("2026 P6", "7/25/26 – 7/31/26",    "2026-08-07", "Pre-Primary Period 6"),
    ("2026 P7", "8/1/26 – 8/13/26",     "2026-08-14", "Pre-Primary Period 7"),
    ("2026 P7A","8/14/26",              "2026-08-21", "Pre-Primary Period 7A"),
    ("2026 G1", "8/15/26 – 8/21/26",    "2026-08-28", "Pre-General Period 1"),
    ("2026 G1A","8/22/26 – 8/28/26",    "2026-09-04", "Pre-General Period 1A"),
    ("2026 G2", "8/29/26 – 9/4/26",     "2026-09-11", "Pre-General Period 2"),
    ("2026 G2A","9/5/26 – 9/11/26",     "2026-09-18", "Pre-General Period 2A"),
    ("2026 G3", "9/12/26 – 9/18/26",    "2026-09-25", "Pre-General Period 3"),
    ("2026 G3A","9/19/26 – 9/25/26",    "2026-10-02", "Pre-General Period 3A"),
    ("2026 G4", "9/26/26 – 10/2/26",    "2026-10-09", "Pre-General Period 4"),
    ("2026 G4A","10/3/26 – 10/9/26",    "2026-10-16", "Pre-General Period 4A"),
    ("2026 G5", "10/10/26 – 10/16/26",  "2026-10-23", "Pre-General Period 5"),
    ("2026 D1", "10/17/26 – 10/23/26",  "2026-10-24", "Daily Report 1 (election week)"),
    ("2026 D2", "10/24/26",             "2026-10-25", "Daily Report 2 (election week)"),
    ("2026 D3", "10/25/26",             "2026-10-26", "Daily Report 3 (election week)"),
    ("2026 D4", "10/26/26",             "2026-10-27", "Daily Report 4 (election week)"),
    ("2026 D5", "10/27/26",             "2026-10-28", "Daily Report 5 (election week)"),
    ("2026 D6", "10/28/26",             "2026-10-29", "Daily Report 6 (election week)"),
    ("2026 G6", "10/17/26 – 10/29/26",  "2026-10-30", "Pre-General Period 6"),
    ("2026 Q4", "10/30/26 – 12/31/26",  "2027-01-11", "Q4 Quarterly"),
]

_STATEWIDE_DEADLINES = [
    ("2025 Q4", "10/1/25 – 12/31/25",   "2026-01-12", "Q4 Quarterly"),
    ("2026 Q1", "1/1/26 – 3/31/26",     "2026-04-10", "Q1 Quarterly"),
    ("2026 Q2", "4/1/26 – 5/31/26",     "2026-06-10", "Q2 Quarterly"),
    ("2026 P1", "6/1/26 – 6/12/26",     "2026-06-19", "Pre-Primary Period 1"),
    ("2026 P1A","6/13/26 – 6/19/26",    "2026-06-26", "Pre-Primary Period 1A"),
    ("2026 P2", "6/20/26 – 6/26/26",    "2026-07-03", "Pre-Primary Period 2"),
    ("2026 P2A","6/27/26 – 7/3/26",     "2026-07-10", "Pre-Primary Period 2A"),
    ("2026 P3", "7/4/26 – 7/10/26",     "2026-07-17", "Pre-Primary Period 3"),
    ("2026 P4", "7/11/26 – 7/17/26",    "2026-07-24", "Pre-Primary Period 4"),
    ("2026 P5", "7/18/26 – 7/24/26",    "2026-07-31", "Pre-Primary Period 5"),
    ("2026 P6", "7/25/26 – 7/31/26",    "2026-08-07", "Pre-Primary Period 6"),
    ("2026 P7", "8/1/26 – 8/13/26",     "2026-08-14", "Pre-Primary Period 7"),
    ("2026 P7A","8/14/26",              "2026-08-21", "Pre-Primary Period 7A"),
    ("2026 G1", "8/15/26 – 8/21/26",    "2026-08-28", "Pre-General Period 1"),
    ("2026 G1A","8/22/26 – 8/28/26",    "2026-09-04", "Pre-General Period 1A"),
    ("2026 G2", "8/29/26 – 9/4/26",     "2026-09-11", "Pre-General Period 2"),
    ("2026 G2A","9/5/26 – 9/11/26",     "2026-09-18", "Pre-General Period 2A"),
    ("2026 G3", "9/12/26 – 9/18/26",    "2026-09-25", "Pre-General Period 3"),
    ("2026 G3A","9/19/26 – 9/25/26",    "2026-10-02", "Pre-General Period 3A"),
    ("2026 G4", "9/26/26 – 10/2/26",    "2026-10-09", "Pre-General Period 4"),
    ("2026 G4A","10/3/26 – 10/9/26",    "2026-10-16", "Pre-General Period 4A"),
    ("2026 G5", "10/10/26 – 10/16/26",  "2026-10-23", "Pre-General Period 5"),
    ("2026 D1", "10/17/26 – 10/23/26",  "2026-10-24", "Daily Report 1 (election week)"),
    ("2026 D2", "10/24/26",             "2026-10-25", "Daily Report 2 (election week)"),
    ("2026 D3", "10/25/26",             "2026-10-26", "Daily Report 3 (election week)"),
    ("2026 D4", "10/26/26",             "2026-10-27", "Daily Report 4 (election week)"),
    ("2026 D5", "10/27/26",             "2026-10-28", "Daily Report 5 (election week)"),
    ("2026 D6", "10/28/26",             "2026-10-29", "Daily Report 6 (election week)"),
    ("2026 G6", "10/17/26 – 10/29/26",  "2026-10-30", "Pre-General Period 6"),
    ("2026 Q4", "10/30/26 – 12/31/26",  "2027-01-11", "Q4 Quarterly"),
    # Termination reports
    ("TR", "After April Qualifying",    "2026-07-23", "Termination Report"),
    ("TR", "After June Qualifying",     "2026-09-10", "Termination Report"),
    ("TR", "Primary Election",          "2026-11-16", "Termination Report"),
    ("TR", "General Election",          "2027-02-01", "Termination Report"),
]

_OTHER_CANDIDATE_DEADLINES = [
    ("2025 Q4", "10/1/25 – 12/31/25",   "2026-01-12", "Q4 Quarterly"),
    ("2026 Q1", "1/1/26 – 3/31/26",     "2026-04-10", "Q1 Quarterly"),
    ("2026 Q2", "4/1/26 – 5/31/26",     "2026-06-10", "Q2 Quarterly"),
    ("2026 P1", "6/1/26 – 6/12/26",     "2026-06-19", "Pre-Primary Period 1"),
    ("2026 P2", "6/13/26 – 6/26/26",    "2026-07-03", "Pre-Primary Period 2"),
    ("2026 P3", "6/27/26 – 7/10/26",    "2026-07-17", "Pre-Primary Period 3"),
    ("2026 P4", "7/11/26 – 7/17/26",    "2026-07-24", "Pre-Primary Period 4"),
    ("2026 P5", "7/18/26 – 7/24/26",    "2026-07-31", "Pre-Primary Period 5"),
    ("2026 P6", "7/25/26 – 7/31/26",    "2026-08-07", "Pre-Primary Period 6"),
    ("2026 P7", "8/1/26 – 8/13/26",     "2026-08-14", "Pre-Primary Period 7"),
    ("2026 G1", "8/14/26 – 8/21/26",    "2026-08-28", "Pre-General Period 1"),
    ("2026 G2", "8/22/26 – 9/4/26",     "2026-09-11", "Pre-General Period 2"),
    ("2026 G3", "9/5/26 – 9/18/26",     "2026-09-25", "Pre-General Period 3"),
    ("2026 G4", "9/19/26 – 10/2/26",    "2026-10-09", "Pre-General Period 4"),
    ("2026 G5", "10/3/26 – 10/16/26",   "2026-10-23", "Pre-General Period 5"),
    ("2026 G6", "10/17/26 – 10/29/26",  "2026-10-30", "Pre-General Period 6"),
    # Termination reports
    ("TR", "After April Qualifying",    "2026-07-23", "Termination Report"),
    ("TR", "After June Qualifying",     "2026-09-10", "Termination Report"),
    ("TR", "Primary Election",          "2026-11-16", "Termination Report"),
    ("TR", "General Election",          "2027-02-01", "Termination Report"),
]


def _to_entries(raw: list[tuple]) -> list[dict]:
    return [
        {"code": code, "cover_period": period, "due": due, "label": label}
        for code, period, due, label in raw
    ]


def get_next_deadline(today: date | None = None) -> dict | None:
    """
    Return the next upcoming filing deadline across all committee types.
    Uses today's date by default.
    """
    today = today or date.today()
    all_dues = [
        (entry["due"], entry["code"], entry["label"])
        for entry in _to_entries(_PC_DEADLINES)
        if entry["due"] >= today.isoformat()
    ]
    if not all_dues:
        return None
    due_str, code, label = min(all_dues)
    due_date = date.fromisoformat(due_str)
    days_away = (due_date - today).days
    return {
        "code": code,
        "label": label,
        "due": due_str,
        "days_away": days_away,
    }


def build_schedule() -> dict:
    """Build the full reporting_schedule.json payload."""
    next_dl = get_next_deadline()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "FL Division of Elections official PDFs (s. 106.07, Fla. Stat.)",
        "election_year": 2026,
        "primary_date": "2026-08-18",
        "general_date": "2026-11-03",
        "next_deadline": next_dl,
        "note_daily_reports": (
            "Political committees and statewide candidates must file DAILY reports "
            "(D1–D6) for Oct 17–28 — new contribution data becomes available every "
            "day in the final stretch before the general election."
        ),
        "committee_types": {
            "political_committees": _to_entries(_PC_DEADLINES),
            "statewide_candidates": _to_entries(_STATEWIDE_DEADLINES),
            "other_candidates": _to_entries(_OTHER_CANDIDATE_DEADLINES),
        },
        "report_period_labels": REPORT_PERIOD_LABELS,
    }


def main() -> int:
    print("=== Reporting Calendar ===\n")

    schedule = build_schedule()
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    out = PUBLIC_DIR / "reporting_schedule.json"
    out.write_text(json.dumps(schedule, indent=2), encoding="utf-8")
    print(f"Wrote {out}")

    next_dl = schedule["next_deadline"]
    if next_dl:
        print(
            f"\nNext filing deadline: {next_dl['code']} ({next_dl['label']})\n"
            f"  Due: {next_dl['due']}  ({next_dl['days_away']} days away)\n"
            f"  Recommendation: run pipeline AFTER {next_dl['due']} for fresh data."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
