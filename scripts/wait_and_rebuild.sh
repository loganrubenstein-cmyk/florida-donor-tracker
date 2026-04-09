#!/bin/bash
# Waits for script 20 (historical candidate scrape) to finish,
# then auto-runs scripts 21 and 22 with --force.
# Run from project root with .venv activated.

set -e
cd "$(dirname "$0")/.."

LOGFILE="data/logs/wait_and_rebuild_$(date +%Y%m%d_%H%M%S).log"
mkdir -p data/logs

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "=== wait_and_rebuild.sh started ==="
log "Watching for script 20 (pid check every 30s)..."

# Poll until script 20's python process is gone
while pgrep -f "20_scrape_candidate_contributions" > /dev/null 2>&1; do
  MANIFEST="data/raw/candidate_contributions/manifest.json"
  if [ -f "$MANIFEST" ]; then
    COMPLETE=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(sum(1 for v in m.values() if v.get('status')=='complete'))" 2>/dev/null || echo "?")
    TOTAL=$(python3 -c "import json; m=json.load(open('$MANIFEST')); print(len(m))" 2>/dev/null || echo "?")
    log "Script 20 still running... $COMPLETE/$TOTAL complete"
  fi
  sleep 30
done

log "Script 20 finished. Running script 21 --force..."
.venv/bin/python scripts/21_import_candidate_contributions.py --force 2>&1 | tee -a "$LOGFILE"

log "Running script 22 --force..."
.venv/bin/python scripts/22_export_candidate_json.py --force 2>&1 | tee -a "$LOGFILE"

log "=== Done. Candidate data fully rebuilt. ==="
log "Log: $LOGFILE"
