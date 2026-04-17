#!/usr/bin/env bash
# One-shot status monitor for the Stage B donors_mv cutover.
# Safe to run anytime. Prints a snapshot of every moving part.
#
# Usage:
#   bash scripts/_cutover_monitor.sh          # one-shot
#   watch -n 30 bash scripts/_cutover_monitor.sh   # live refresh every 30s

set -u
cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'

section() { echo; echo "${BOLD}${BLUE}── $1 ──${RESET}"; }
kv()      { printf "  %-22s %s\n" "$1" "$2"; }
ok()      { echo "${GREEN}✓${RESET} $*"; }
warn()    { echo "${YELLOW}⚠${RESET} $*"; }
err()     { echo "${RED}✗${RESET} $*"; }

# ── Header ──────────────────────────────────────────────────────────────────
echo "${BOLD}Florida Donor Tracker — Stage B cutover monitor${RESET}"
echo "${DIM}$(date '+%Y-%m-%d %H:%M:%S %Z')${RESET}"

# ── 1. Script 09 (fuzzy dedup) ──────────────────────────────────────────────
section "Script 09 — canonical dedup"
DEDUP_PID=$(pgrep -f "09_deduplicate_donors.py" | while read p; do [ "$(ps -o comm= -p $p | grep -c Python)" = "1" ] && echo $p; done | head -1)
[ -z "$DEDUP_PID" ] && DEDUP_PID=$(pgrep -f "09_deduplicate_donors.py" | tail -1)
if [ -n "$DEDUP_PID" ]; then
  read -r ELAPSED CPU <<< "$(ps -o etime=,%cpu= -p "$DEDUP_PID" | awk '{print $1" "$2}')"
  RSS_MB=$(ps -o rss= -p "$DEDUP_PID" | awk '{printf "%.0f", $1/1024}')
  ok "running (PID $DEDUP_PID)"
  kv "elapsed"      "$ELAPSED"
  kv "cpu"          "${CPU}%"
  kv "rss"          "${RSS_MB} MB"
else
  warn "not running (finished, crashed, or not yet started)"
fi

DEDUP_LOG="/private/tmp/claude-501/-Users-loganrubenstein/1fe81d36-9a3b-4927-a42c-2b6e16f820a5/tasks/brm20czai.output"
if [ -f "$DEDUP_LOG" ]; then
  kv "last log line"    "$(tail -1 "$DEDUP_LOG")"
  if grep -q "Committed\." "$DEDUP_LOG"; then
    ok "  completion marker 'Committed.' present"
  elif grep -q "\[dry-run\]" "$DEDUP_LOG"; then
    warn "  dry-run marker (should have been a real run!)"
  fi
fi

# ── 2. Orchestrator ─────────────────────────────────────────────────────────
section "Cutover orchestrator"
ORCH_PID=$(pgrep -f "_cutover_orchestrator.py" | head -1)
if [ -n "$ORCH_PID" ]; then
  read -r O_ELAPSED O_CPU <<< "$(ps -o etime=,%cpu= -p "$ORCH_PID" | awk '{print $1" "$2}')"
  ok "running (PID $ORCH_PID)"
  kv "elapsed"    "$O_ELAPSED"
  kv "cpu"        "${O_CPU}%"
else
  warn "not running"
fi

LATEST_LOG=$(ls -t data/logs/cutover_*.log 2>/dev/null | grep -v nohup | head -1)
if [ -n "$LATEST_LOG" ]; then
  kv "log file"       "$LATEST_LOG"
  echo "  ${DIM}last 6 lines:${RESET}"
  tail -6 "$LATEST_LOG" | sed 's/^/    /'
fi

if [ -f data/logs/cutover_state.json ]; then
  echo "  ${DIM}state:${RESET}"
  cat data/logs/cutover_state.json | sed 's/^/    /'
fi

# ── 3. DB snapshot (cheap queries) ──────────────────────────────────────────
section "DB state (live)"
.pipeline-venv/bin/python3 - <<'PY' 2>&1 | sed 's/^/  /'
from dotenv import load_dotenv; load_dotenv('.env.local')
import os, psycopg2
try:
    conn = psycopg2.connect(os.getenv('SUPABASE_DB_URL'), connect_timeout=10)
    conn.autocommit = True
    cur = conn.cursor()

    # donor_aliases growth (dedup writes here)
    cur.execute("SELECT count(*), count(*) FILTER (WHERE source='dedup_pipeline') FROM donor_aliases")
    aliases_total, aliases_dedup = cur.fetchone()
    print(f"donor_aliases          {aliases_total:>10,} total    ({aliases_dedup:,} from dedup_pipeline)")

    # donor_entities
    cur.execute("SELECT count(*) FROM donor_entities")
    print(f"donor_entities         {cur.fetchone()[0]:>10,}")

    # Review queue growth
    cur.execute("SELECT count(*), count(*) FILTER (WHERE NOT resolved) FROM donor_review_queue")
    tot, unres = cur.fetchone()
    print(f"donor_review_queue     {tot:>10,} total    ({unres:,} unresolved)")

    # MV existence (Step 2 success)
    cur.execute("SELECT count(*) FROM pg_matviews WHERE matviewname='donors_mv'")
    has_mv = cur.fetchone()[0] > 0
    print(f"donors_mv              {'EXISTS' if has_mv else 'not yet created':>10}")

    # Legacy rename (Step 2 success)
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='donors_legacy'")
    has_legacy = cur.fetchone()[0] > 0
    print(f"donors_legacy          {'EXISTS' if has_legacy else 'not yet':>10}")

    if has_mv:
        cur.execute("SELECT count(*), COALESCE(SUM(total_combined),0) FROM donors_mv")
        n, total = cur.fetchone()
        print(f"  donors_mv rows       {n:>10,}")
        print(f"  donors_mv total      ${float(total):>16,.2f}")

        cur.execute("SELECT total_combined, num_contributions FROM donors_mv WHERE slug='florida-power-light-company'")
        row = cur.fetchone()
        if row:
            print(f"  FPL total_combined   ${float(row[0]):>16,.2f}  ({row[1]:,} contributions)")

    conn.close()
except Exception as e:
    print(f"  DB query FAILED: {e}")
PY

# ── 4. Quick verdict ────────────────────────────────────────────────────────
section "Verdict"
if [ -f data/logs/cutover_state.json ] && grep -q '"step3_done"' data/logs/cutover_state.json; then
  ok "CUTOVER COMPLETE — verify /donor/florida-power-light-company on the site"
elif [ -z "$DEDUP_PID" ] && [ -z "$ORCH_PID" ]; then
  if grep -q "CUTOVER COMPLETE" "$LATEST_LOG" 2>/dev/null; then
    ok "CUTOVER COMPLETE — verify the site"
  else
    err "both processes gone but no completion marker — investigate log"
  fi
elif [ -n "$ORCH_PID" ] && [ -z "$DEDUP_PID" ]; then
  warn "script 09 finished; orchestrator Step 1–3 in progress"
else
  warn "script 09 still running; orchestrator waiting"
fi
echo
