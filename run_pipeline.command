#!/bin/zsh
# run_pipeline.command
# Double-click to run the full FL Donor Tracker data pipeline.
# Skips expenditure scraping (expend.exe is 502 as of 2026-04-07).
#
# Steps:
#   01 — import raw contribution files → contributions.csv
#   09 — deduplicate donor names      → contributions_deduped.csv
#   08 — export JSON for the website  → public/data/
#   10 — build network graph          → public/data/network_graph.json
#
# After this finishes, run: npm run build (in the project directory)

set -e  # exit on any error

PROJECT="$HOME/Claude Projects/florida-donor-tracker"
cd "$PROJECT"

# Activate virtualenv
source .venv/bin/activate

LOG_DIR="$PROJECT/data/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG="$LOG_DIR/pipeline_$TIMESTAMP.log"

echo "=== FL Donor Tracker Pipeline ===" | tee "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Health check — contributions CGI only (expend.exe 502 is expected, not a blocker)
echo "--- Checking FL DoE server ---" | tee -a "$LOG"
python scripts/check_server.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Step 01: Import raw files
echo "--- Step 01: Import contributions ---" | tee -a "$LOG"
python scripts/01_import_finance.py 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Step 09: Deduplicate (--force to always use latest thresholds)
echo "--- Step 09: Deduplicate donors ---" | tee -a "$LOG"
python scripts/09_deduplicate_donors.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Step 08: Export JSON
echo "--- Step 08: Export JSON ---" | tee -a "$LOG"
python scripts/08_export_json.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Step 10: Build network graph
echo "--- Step 10: Build network graph ---" | tee -a "$LOG"
python scripts/10_spider_graph.py --force 2>&1 | tee -a "$LOG"
echo "" | tee -a "$LOG"

echo "=== Pipeline complete ===" | tee -a "$LOG"
echo "Finished: $(date)" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Log saved to: $LOG"
echo ""
echo "Next: run 'npm run build' in the project directory to update the website."
echo ""
echo "Press any key to close..."
read -k 1
