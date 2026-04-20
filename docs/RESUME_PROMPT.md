# Resume Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session (run from `~/Claude Projects/florida-donor-tracker`).

---

I'm resuming work on the Florida Donor Tracker data-integrity overhaul. The full plan is at `docs/DATA_INTEGRITY_OVERHAUL_PLAN.md` — read it for context.

**Where we left off (2026-04-17):**
- Stage A (additive schema) complete: migrations 015, 018, 019, 020, 021 all applied.
- Stage B Phase 2 in progress: full 22M-row `scripts/09_deduplicate_donors.py` was launched as PID 39123 with a reconnect+JSON-cache fix (close DB conn before 3h fuzzy phase, reopen fresh conn for upserts, cache fuzzy results to `data/logs/09_clusters.json` so a second failure doesn't lose the work).

**First thing to do — check the run:**

1. Run `ps -p 39123` — if it's still alive, script is still working (fuzzy phase takes ~3h).
2. Run `tail -60 data/logs/09_full_run.log` — look for one of three states:
   - **Still running:** output stops after "Loading existing aliases…" until fuzzy finishes; that's normal (in-memory, no log output for hours).
   - **Finished cleanly:** ends with `Committed.`
   - **Crashed on upsert:** SSL/Operation timeout traceback. In that case `data/logs/09_clusters.json` should exist — relaunch with `.pipeline-venv/bin/python3 -u scripts/09_deduplicate_donors.py --resume-from-cache` (skips the 3h load+fuzzy).
3. If successful, verify in Supabase: `SELECT COUNT(*) FROM donor_aliases WHERE source='dedup_pipeline'` should be in the hundreds of thousands. `SELECT COUNT(*) FROM donor_entities` should be ~250K.

**What comes next after 22M run succeeds:**
- Task #11 (Stage B cutover): rewrite downstream loaders `scripts/25_export_donor_profiles.py`, `41_load_contributions.py`, `42_load_candidate_contributions_supabase.py` to JOIN against `donor_aliases` so contributions become source-of-truth.
- Then Phase 1.4 (donors_mv materialized view) and Phase 1.5 (committees name-history).

**How I work:**
- I'm new to terminal/web dev — explain commands before running them, let me run destructive ones myself.
- No end-of-response recaps; I read the diff.
- Default to 25% depth (2-4 sentence responses) unless I ask for more.
- Verify before "fixing" anything from the plan — audit notes go stale fast.

Start by checking the PID 39123 state and report what you find.
