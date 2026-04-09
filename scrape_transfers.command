#!/bin/zsh
# scrape_transfers.command
# Double-click to scrape fund transfer records for all committees, then re-process.
# Script 11 is resumable — already-downloaded committees are skipped automatically.
#
# This captures the "laundering layer": PC → PC → Candidate money chains that
# don't appear in contribution records.
#
# WARNING: Takes ~40 minutes for the full 1,688-committee scrape on first run.
# Subsequent runs are fast (only new/changed committees are fetched).
#
# Steps:
#   11 — scrape FundXfers.exe → data/raw/transfers/Transfer_*.txt
#   12 — import transfer files → data/processed/transfers.csv
#   08 — export JSON (now includes transfer totals per committee)
#   10 — rebuild network graph (now includes transfer edges)

set -e

PROJECT="$HOME/Claude Projects/florida-donor-tracker"
cd "$PROJECT"

source .venv/bin/activate

LOG_DIR="$PROJECT/data/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG="$LOG_DIR/transfers_$TIMESTAMP.log"

echo "=== Scrape Fund Transfers ===" | tee "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Checking FL DoE server ---" | tee -a "$LOG"
python scripts/check_server.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Step 11: Scrape fund transfers (resumable, ~40 min first run) ---" | tee -a "$LOG"
python scripts/11_scrape_transfers.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Step 12: Import transfer files ---" | tee -a "$LOG"
python scripts/12_import_transfers.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Step 08: Export JSON (with transfer totals) ---" | tee -a "$LOG"
python scripts/08_export_json.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Step 10: Rebuild network graph (with transfer edges) ---" | tee -a "$LOG"
python scripts/10_spider_graph.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "=== Transfer scrape complete ===" | tee -a "$LOG"
echo "Finished: $(date)" | tee -a "$LOG"
echo "Log: $LOG"
echo ""
echo "Next: run 'npm run build' to update the website."
echo ""
echo "Press any key to close..."
read -k 1
