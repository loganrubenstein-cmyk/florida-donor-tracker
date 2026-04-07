#!/bin/zsh
# scrape_new_committees.command
# Double-click to scrape any committees not yet in the manifest, then re-process.
# Script 03 is resumable — already-downloaded committees are skipped automatically.
#
# Run this periodically to expand coverage as new committees register,
# or to pick up the ~200 committees not yet scraped.

set -e

PROJECT="$HOME/Claude Projects/florida-donor-tracker"
cd "$PROJECT"

source .venv/bin/activate

LOG_DIR="$PROJECT/data/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG="$LOG_DIR/scrape_$TIMESTAMP.log"

echo "=== Scrape New Committees ===" | tee "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Checking FL DoE server ---" | tee -a "$LOG"
python scripts/check_server.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Step 03: Scrape new committees (resumable) ---" | tee -a "$LOG"
python scripts/03_scrape_contributions.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "--- Re-running pipeline on updated data ---" | tee -a "$LOG"
python scripts/01_import_finance.py 2>&1 | tee -a "$LOG"
python scripts/09_deduplicate_donors.py --force 2>&1 | tee -a "$LOG"
python scripts/08_export_json.py --force 2>&1 | tee -a "$LOG"
python scripts/10_spider_graph.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "=== Done ===" | tee -a "$LOG"
echo "Finished: $(date)" | tee -a "$LOG"
echo "Log: $LOG"
echo ""
echo "Next: run 'npm run build' to update the website."
echo ""
echo "Press any key to close..."
read -k 1
