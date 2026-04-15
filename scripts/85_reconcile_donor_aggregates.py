"""
Script 85: Reconcile Donor Aggregates

Recomputes total_soft, total_combined, and num_contributions for every donor
in the donors table by summing directly from the contributions table.
Updates rows where the live sum EXCEEDS the stored value by more than $1
(one-directional: never decreases a stored total, since decreases indicate
incomplete slug matching, not actual data loss).

Also reconciles donor_committees: recomputes per-(donor_slug, acct_num)
totals and upserts via ON CONFLICT.

Run after:
  - Any backfill script that adds contributions
  - Script 86b (ghost slug remaps)
  - Any quarterly data refresh

Usage:
    .venv/bin/python scripts/85_reconcile_donor_aggregates.py
"""

import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

DONOR_BATCH_SIZE = 2_000
DC_BATCH_SIZE    = 2_000
DRIFT_THRESHOLD  = 1.0


def fmt_secs(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, sec = divmod(int(seconds), 60)
    if minutes < 60:
        return f"{minutes}m {sec}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m {sec}s"


def chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    wcur = conn.cursor()

    # Session-level settings — must be set each transaction under pgbouncer
    # (we re-apply in autocommit mode for reads, then switch off for writes)
    conn.autocommit = True
    cur.execute("SET application_name = 'script_85_reconcile'")
    cur.execute("SET statement_timeout = '15min'")
    cur.execute("SET idle_in_transaction_session_timeout = '5min'")
    cur.execute("SET lock_timeout = '30s'")
    conn.autocommit = False

    # ── Step 1: Live sums from contributions ──────────────────────────────────

    print("Computing live sums from contributions table...")
    print("  (may take 30–90 seconds on 19M+ rows)")
    t0 = time.time()
    cur.execute("""
        SELECT
            donor_slug,
            SUM(CASE WHEN recipient_type = 'committee' THEN amount ELSE 0 END)::float AS soft,
            COUNT(*)::int AS n
        FROM contributions
        WHERE donor_slug IS NOT NULL
        GROUP BY donor_slug
    """)
    live_rows = cur.fetchall()
    live_by_slug = {r["donor_slug"]: r for r in live_rows}
    print(f"  {len(live_by_slug):,} distinct donor_slugs in contributions ({fmt_secs(time.time()-t0)})")

    # ── Step 2: Stored donor values ───────────────────────────────────────────

    print("Loading stored donor totals...")
    t0 = time.time()
    cur.execute("SELECT slug, total_soft, total_hard, num_contributions FROM donors")
    donor_rows = cur.fetchall()
    print(f"  {len(donor_rows):,} donors in table ({fmt_secs(time.time()-t0)})")

    # ── Step 3: Find donors where live > stored ───────────────────────────────
    #
    # Only reconcile upward. If live_soft < stored_soft the gap is due to
    # incomplete slug matching (name variants with NULL slugs), not real data
    # loss. Those donors will be corrected once slug matching improves.

    print("Comparing donors (one-directional: only apply increases)...")
    updates = []
    skipped_decreases = 0

    for d in donor_rows:
        slug = d["slug"]
        live = live_by_slug.get(slug)
        if live is None:
            continue

        live_soft   = float(live["soft"] or 0)
        live_n      = int(live["n"] or 0)
        stored_soft = float(d["total_soft"] or 0)
        stored_hard = float(d["total_hard"] or 0)

        gain = live_soft - stored_soft
        if gain > DRIFT_THRESHOLD:
            updates.append((slug, live_soft, live_soft + stored_hard, live_n, stored_soft, gain))
        elif stored_soft - live_soft > DRIFT_THRESHOLD:
            skipped_decreases += 1

    print(f"  {len(updates):,} donors will gain (live > stored)")
    print(f"  {skipped_decreases:,} donors skipped (live < stored — slug matching gap, not an error)")

    if updates:
        print("  Top 20 gains:")
        for slug, new_soft, _, __, old_soft, gain in sorted(updates, key=lambda x: -x[5])[:20]:
            print(f"    {slug[:45]:<45}  ${old_soft:>14,.2f} → ${new_soft:>14,.2f}  (+${gain:,.2f})")

        print("\nApplying donor updates in batches...")
        t0 = time.time()
        updated = 0

        for i, batch in enumerate(chunks(updates, DONOR_BATCH_SIZE), start=1):
            payload = [(slug, new_soft, new_combined, new_n)
                       for slug, new_soft, new_combined, new_n, _old, _gain in batch]

            # Inline VALUES avoids temp tables (safe under pgbouncer transaction mode)
            psycopg2.extras.execute_values(
                wcur,
                """
                UPDATE donors d
                SET total_soft        = v.new_soft::double precision,
                    total_combined    = v.new_combined::double precision,
                    num_contributions = v.new_n::int
                FROM (VALUES %s) AS v(slug, new_soft, new_combined, new_n)
                WHERE d.slug = v.slug
                """,
                payload,
                page_size=len(payload),
            )
            conn.commit()
            updated += len(batch)
            print(f"  donor batch {i}: {updated:,}/{len(updates):,} ({fmt_secs(time.time()-t0)})")

        total_gain = sum(u[5] for u in updates)
        print(f"\n  Total added across {len(updates):,} donors: +${total_gain:,.2f}")
    else:
        print("  No upward corrections needed.")

    # ── Step 4: Reconcile donor_committees ────────────────────────────────────

    print("\nReconciling donor_committees from contributions...")
    print("  (aggregating per donor_slug × acct_num — may take 1–2 min)")
    t0 = time.time()

    cur.execute("""
        SELECT
            c.donor_slug,
            c.recipient_acct      AS acct_num,
            co.committee_name,
            SUM(c.amount)::float  AS total,
            COUNT(*)::int         AS num_contributions
        FROM contributions c
        LEFT JOIN committees co ON co.acct_num = c.recipient_acct
        WHERE c.donor_slug IS NOT NULL
          AND c.recipient_type = 'committee'
        GROUP BY c.donor_slug, c.recipient_acct, co.committee_name
        ORDER BY c.donor_slug, c.recipient_acct
    """)
    dc_rows = cur.fetchall()
    print(f"  {len(dc_rows):,} (donor_slug, acct_num) pairs fetched ({fmt_secs(time.time()-t0)})")

    upserted  = 0
    batch_num = 0
    t0 = time.time()

    for batch in chunks(dc_rows, DC_BATCH_SIZE):
        batch_num += 1
        payload = [
            (
                r["donor_slug"],
                r["acct_num"],
                r["committee_name"],
                float(r["total"] or 0),
                int(r["num_contributions"] or 0),
            )
            for r in batch
        ]

        psycopg2.extras.execute_values(
            wcur,
            """
            INSERT INTO donor_committees
                (donor_slug, acct_num, committee_name, total, num_contributions)
            VALUES %s
            ON CONFLICT (donor_slug, acct_num) DO UPDATE SET
                total             = EXCLUDED.total,
                num_contributions = EXCLUDED.num_contributions,
                committee_name    = COALESCE(EXCLUDED.committee_name, donor_committees.committee_name)
            """,
            payload,
            page_size=len(payload),
        )
        conn.commit()
        upserted += len(payload)
        print(f"  dc batch {batch_num}: {upserted:,} rows upserted ({fmt_secs(time.time()-t0)})")

    cur.close()
    wcur.close()
    conn.close()

    print("\n✓ Script 85 complete.")
    print(f"  {len(updates):,} donor aggregate rows increased")
    print(f"  {skipped_decreases:,} donors skipped (slug-matching gap — not errors)")
    print(f"  {upserted:,} donor_committees rows reconciled")


if __name__ == "__main__":
    main()
