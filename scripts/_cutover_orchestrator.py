#!/usr/bin/env python3
"""
Stage B cutover orchestrator — runs unattended once script 09 real run completes.

Sequence:
  0. Wait for scripts/09_deduplicate_donors.py (real run) to print "Committed."
  1. UPDATE contributions.donor_slug from fresh donor_aliases
  2. Apply migration 016 (donors_mv cutover + compat views)
  3. Run script 85 (REFRESH MV + validate totals within $0.01)

Resilient to brief wifi/DB drops via exponential-backoff retry on all DB ops.
Every step is idempotent — safe to re-run if the orchestrator itself is killed.

Logs everything to data/logs/cutover_<ts>.log.
"""

import os
import re
import sys
import time
import subprocess
from pathlib import Path
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]

TS = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_DIR = ROOT / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / f"cutover_{TS}.log"
STATE_FILE = LOG_DIR / "cutover_state.json"

SCRIPT_09_TASK_OUTPUT = Path(
    "/private/tmp/claude-501/-Users-loganrubenstein/"
    "1fe81d36-9a3b-4927-a42c-2b6e16f820a5/tasks/brm20czai.output"
)

POLL_SECONDS = 120
MAX_DB_RETRIES = 20


def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def save_state(step: str, data: dict | None = None) -> None:
    import json
    state = {"step": step, "ts": datetime.now().isoformat(), "data": data or {}}
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Step 0: wait for 09 ──────────────────────────────────────────────────────
def wait_for_script_09() -> None:
    log("Step 0: waiting for script 09 real run to finish...")
    while True:
        proc_alive = subprocess.run(
            ["pgrep", "-f", "09_deduplicate_donors.py"],
            capture_output=True, text=True
        ).stdout.strip()

        if SCRIPT_09_TASK_OUTPUT.exists():
            content = SCRIPT_09_TASK_OUTPUT.read_text()
            if "Committed." in content:
                log("  → script 09 emitted 'Committed.' — proceeding.")
                return
            if "[dry-run]" in content:
                log("  → DETECTED dry-run completion marker (bug: should be real run).")
                sys.exit("orchestrator aborted: 09 ran in dry-run mode")

        if not proc_alive:
            # Process gone but no completion marker → crashed
            tail = (SCRIPT_09_TASK_OUTPUT.read_text()[-2000:]
                    if SCRIPT_09_TASK_OUTPUT.exists() else "(no output file)")
            log(f"  → script 09 process gone without 'Committed.'. Tail:\n{tail}")
            sys.exit("orchestrator aborted: 09 did not complete cleanly")

        time.sleep(POLL_SECONDS)


# ── DB helper with retry ─────────────────────────────────────────────────────
def connect_with_retry():
    for attempt in range(1, MAX_DB_RETRIES + 1):
        try:
            conn = psycopg2.connect(DB_URL, connect_timeout=30)
            return conn
        except psycopg2.OperationalError as e:
            wait = min(30 * attempt, 600)
            log(f"  DB connect attempt {attempt} failed ({e.__class__.__name__}). "
                f"Retry in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"DB connection failed after {MAX_DB_RETRIES} attempts")


def exec_with_retry(label: str, sql: str, autocommit: bool = True, statement_timeout_ms: int | None = None) -> int:
    for attempt in range(1, MAX_DB_RETRIES + 1):
        try:
            conn = connect_with_retry()
            conn.autocommit = autocommit
            cur = conn.cursor()
            if statement_timeout_ms:
                cur.execute(f"SET statement_timeout = {statement_timeout_ms}")
            cur.execute(sql)
            rc = cur.rowcount
            if not autocommit:
                conn.commit()
            conn.close()
            return rc
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            wait = min(30 * attempt, 600)
            log(f"  {label}: attempt {attempt} failed ({e.__class__.__name__}: "
                f"{str(e)[:200]}). Retry in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"{label}: failed after {MAX_DB_RETRIES} attempts")


def scalar_with_retry(label: str, sql: str):
    for attempt in range(1, MAX_DB_RETRIES + 1):
        try:
            conn = connect_with_retry()
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(sql)
            row = cur.fetchone()
            conn.close()
            return row[0] if row else None
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            wait = min(30 * attempt, 600)
            log(f"  {label}: attempt {attempt} failed ({e}). Retry in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"{label}: failed after {MAX_DB_RETRIES} attempts")


# ── Step 1: rewrite donor_slug ───────────────────────────────────────────────
def step1_rewrite_slugs() -> None:
    log("Step 1: rewriting contributions.donor_slug from fresh donor_aliases...")
    save_state("step1_started")

    before_null     = scalar_with_retry("pre-null",   "SELECT count(*) FROM contributions WHERE donor_slug IS NULL")
    before_distinct = scalar_with_retry("pre-distinct","SELECT count(DISTINCT donor_slug) FROM contributions")
    alias_count     = scalar_with_retry("alias-count","SELECT count(*) FROM donor_aliases")
    log(f"  pre:  NULL slugs={before_null:,}  distinct slugs={before_distinct:,}  aliases={alias_count:,}")

    # Snapshot pre-update counts for rollback visibility
    exec_with_retry("snapshot",
        "CREATE TABLE IF NOT EXISTS contributions_slug_pre_cutover AS "
        "SELECT id, donor_slug FROM contributions WHERE donor_slug IS NOT NULL")

    # The UPDATE — idempotent via "IS DISTINCT FROM" guard
    sql = """
        UPDATE contributions c
           SET donor_slug = a.canonical_slug
          FROM donor_aliases a
         WHERE a.alias_text = donor_normalize(c.contributor_name)
           AND c.donor_slug IS DISTINCT FROM a.canonical_slug
    """
    log("  executing UPDATE (15-60 min possible)...")
    t0 = time.time()
    # statement_timeout = 2h
    updated = exec_with_retry("update-slugs", sql, autocommit=True, statement_timeout_ms=7_200_000)
    log(f"  rows updated: {updated:,} in {time.time() - t0:.0f}s")

    after_null     = scalar_with_retry("post-null",   "SELECT count(*) FROM contributions WHERE donor_slug IS NULL")
    after_distinct = scalar_with_retry("post-distinct","SELECT count(DISTINCT donor_slug) FROM contributions")
    log(f"  post: NULL slugs={after_null:,}  distinct slugs={after_distinct:,}")
    log(f"  Δ:    distinct slugs {before_distinct:,} → {after_distinct:,} "
        f"(merged {before_distinct - after_distinct:,} slugs into canonicals)")

    save_state("step1_done", {
        "rows_updated": updated,
        "distinct_slugs_before": before_distinct,
        "distinct_slugs_after": after_distinct,
    })


# ── Step 2: apply migration 016 ──────────────────────────────────────────────
def step2_apply_migration_016() -> None:
    log("Step 2: applying migration 016 (donors → donors_mv cutover)...")
    save_state("step2_started")

    migration_file = ROOT / "supabase" / "migrations" / "016_donors_materialized_view.sql"
    sql = migration_file.read_text()

    # Strip psql-only directives if any (none in 016, but be safe)
    sql = re.sub(r"^\\\\.*$", "", sql, flags=re.MULTILINE)

    # Idempotency pre-check: if donors_mv already exists and donors_legacy exists, skip
    already = scalar_with_retry("mv-exists",
        "SELECT count(*) FROM pg_matviews WHERE matviewname = 'donors_mv'")
    if already:
        log("  donors_mv already exists — migration 016 appears applied. Skipping.")
        save_state("step2_skipped_already_applied")
        return

    # Run in a single transaction; retry on connection failure
    for attempt in range(1, MAX_DB_RETRIES + 1):
        try:
            conn = connect_with_retry()
            conn.autocommit = False
            cur = conn.cursor()
            cur.execute("SET statement_timeout = 1800000")  # 30 min
            cur.execute(sql)
            conn.commit()
            conn.close()
            log("  migration 016 applied + initial refresh done.")
            save_state("step2_done")
            return
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            wait = min(30 * attempt, 600)
            log(f"  migration-016 attempt {attempt} failed ({e}). Retry in {wait}s...")
            time.sleep(wait)
        except Exception as e:
            log(f"  migration-016 FATAL: {e}")
            raise

    raise RuntimeError("migration 016 failed after all retries")


# ── Step 3: reconcile ─────────────────────────────────────────────────────────
def step3_run_script_85() -> bool:
    log("Step 3: running script 85 (refresh MV + hard-validate totals)...")
    save_state("step3_started")

    for attempt in range(1, 4):
        result = subprocess.run(
            [str(ROOT / ".pipeline-venv" / "bin" / "python3"), "-u",
             "scripts/85_reconcile_donor_aggregates.py"],
            cwd=str(ROOT),
            capture_output=True, text=True,
            timeout=3600,
        )
        log(f"  attempt {attempt}: exit={result.returncode}")
        if result.stdout:
            log("  stdout:\n" + result.stdout)
        if result.stderr:
            log("  stderr:\n" + result.stderr)

        if result.returncode == 0:
            save_state("step3_done")
            return True

        # Retry transient DB errors
        if any(m in (result.stderr or "") for m in ["OperationalError", "SSL", "connection"]):
            log(f"  transient failure — retrying in 60s...")
            time.sleep(60)
            continue
        break

    save_state("step3_failed")
    return False


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log("=" * 70)
    log("STAGE B CUTOVER ORCHESTRATOR — starting")
    log(f"log file: {LOG_FILE}")
    log("=" * 70)

    try:
        wait_for_script_09()
    except SystemExit:
        raise
    except Exception as e:
        log(f"FATAL during Step 0 (wait): {e}")
        sys.exit(10)

    try:
        step1_rewrite_slugs()
    except Exception as e:
        log(f"FATAL during Step 1 (rewrite slugs): {e}")
        sys.exit(11)

    try:
        step2_apply_migration_016()
    except Exception as e:
        log(f"FATAL during Step 2 (migration 016): {e}")
        sys.exit(12)

    ok = step3_run_script_85()
    if not ok:
        log("Step 3 reconcile FAILED. MV exists but totals don't match. "
            "Investigate — do not deploy.")
        sys.exit(13)

    log("=" * 70)
    log("CUTOVER COMPLETE — all 3 steps passed. Site ready for post-cutover verification.")
    log("=" * 70)


if __name__ == "__main__":
    main()
