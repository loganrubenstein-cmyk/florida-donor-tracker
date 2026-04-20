#!/bin/bash
# Launch script 09 (22M-row dedup) under caffeinate + nohup.
# Output → data/logs/09_full_run.log. Safe to close the terminal after.
cd "$(dirname "$0")/.."
caffeinate -is nohup .pipeline-venv/bin/python3 -u scripts/09_deduplicate_donors.py > data/logs/09_full_run.log 2>&1 &
echo "launched pid=$!"
echo "log: data/logs/09_full_run.log"
echo "tail with: tail -f data/logs/09_full_run.log"
