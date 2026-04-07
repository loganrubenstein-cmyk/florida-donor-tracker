# scripts/06_orchestrate.py
"""
Script 06: Master pipeline runner.

Runs the full data collection pipeline in the correct order:
  1. Download committee + candidate registry files
  2. Import registry files into processed CSVs
  3. Scrape contributions for every committee (resumable)
  4. Scrape expenditures for every committee (resumable)
  5. Run the contributions ETL (consolidate into one CSV)

Each step streams its output to the terminal in real time.
If a step fails, the pipeline stops and tells you which step failed.
Re-running after a fix will skip already-completed scraping work.

Usage (from project root, with .venv activated):
    python scripts/06_orchestrate.py
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPTS = Path(__file__).parent

STEPS = [
    ("Download registry",         "02_download_registry.py",    []),
    ("Import registry",           "05_import_registry.py",      []),
    ("Scrape contributions",      "03_scrape_contributions.py",  []),
    ("Scrape expenditures",       "04_scrape_expenditures.py",   []),
    ("Import contributions ETL",  "01_import_finance.py",        []),
    ("Import expenditures ETL",   "07_import_expenditures.py",   []),
    ("Deduplicate donors",        "09_deduplicate_donors.py",    []),
    ("Export JSON",               "08_export_json.py",           []),
    ("Spider network graph",      "10_spider_graph.py",          []),
]


def run_step(script_name: str, args: list[str]) -> bool:
    """
    Run `python <script_name> <args>` as a subprocess.
    Output streams to the terminal in real time.
    Returns True if the exit code is 0.
    """
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / script_name)] + args,
    )
    return result.returncode == 0


def main() -> int:
    start = datetime.now()
    print(f"\n{'='*60}")
    print(f"  Florida Campaign Finance Pipeline")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")
    print()
    print("Steps to run:")
    for i, (name, _, _) in enumerate(STEPS, 1):
        print(f"  {i}. {name}")
    print()

    for i, (step_name, script, args) in enumerate(STEPS, 1):
        print(f"\n{'─'*60}")
        print(f"  Step {i}/{len(STEPS)}: {step_name}")
        print(f"{'─'*60}\n")

        success = run_step(script, args)

        if not success:
            print(f"\n{'='*60}")
            print(f"  PIPELINE FAILED at step {i}: {step_name}")
            print(f"  Fix the error above and re-run.")
            print(f"  Scraping steps 3 and 4 are resumable — already-downloaded")
            print(f"  committees will be skipped automatically.")
            print(f"{'='*60}\n")
            return 1

    elapsed = datetime.now() - start
    minutes, seconds = divmod(int(elapsed.total_seconds()), 60)
    print(f"\n{'='*60}")
    print(f"  PIPELINE COMPLETE")
    print(f"  Total time: {minutes}m {seconds}s")
    print(f"{'='*60}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
