#!/usr/bin/env python3
"""
Populate donor_addresses + principal_addresses for address-based corroboration
of donor↔principal name matches. Backend-only tool — does not alter
donor_principal_links_v.

Approach:
  donor_addresses     — chunked scan of contributions (22M rows), extract
                         leading street number + 5-digit zip, DISTINCT per donor_slug.
  principal_addresses — join principals.name to fl_corporations.entity_name
                         exactly (UPPER), extract street_num + zip from
                         the sunbiz address fields.

Re-run after:
  - contributions reload (new filings)
  - fl_corporations refresh (Sunbiz SFTP pull)
  - principals refresh (lobbyist registration scrape)

The helper view donor_principal_address_corroboration_v joins the two tables
on (street_num, zip). Consumers use it to mark address_corroborated=true on
name-match rows.
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values

ROOT = Path(__file__).resolve().parent.parent
env = ROOT / ".env.local"
if env.exists():
    for line in env.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


STREET_NUM_RE = re.compile(r"^\s*(\d+)")
ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


def normalize_address(address: str | None, city_state_zip: str | None) -> tuple[str, str] | None:
    if not address or not city_state_zip:
        return None
    m = STREET_NUM_RE.match(address)
    if not m:
        return None
    z = ZIP_RE.search(city_state_zip)
    if not z:
        return None
    return (m.group(1), z.group(1))


def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("SUPABASE_DB_URL not set", file=sys.stderr)
        return 1

    conn = psycopg2.connect(db_url, keepalives=1, keepalives_idle=30)
    conn.autocommit = False

    # ── donor_addresses ──────────────────────────────────────────────────────
    # Chunked scan keyed by donor_slug ordinal so we don't time out on a single
    # large DISTINCT aggregate.
    print("Populating donor_addresses from contributions …", flush=True)
    with conn.cursor(name="contrib_stream") as cur:  # server-side cursor
        cur.itersize = 50000
        cur.execute(
            """
            SELECT donor_slug, contributor_address, contributor_city_state_zip
            FROM contributions
            WHERE donor_slug IS NOT NULL
              AND contributor_address IS NOT NULL
              AND contributor_city_state_zip IS NOT NULL
            """
        )
        seen: set[tuple[str, str, str]] = set()
        buf: list[tuple[str, str, str]] = []
        total_rows = 0
        for donor_slug, addr, csz in cur:
            total_rows += 1
            n = normalize_address(addr, csz)
            if not n:
                continue
            key = (donor_slug, n[0], n[1])
            if key in seen:
                continue
            seen.add(key)
            buf.append(key)
            if total_rows % 500_000 == 0:
                print(f"  scanned {total_rows:,} rows, buffered {len(buf):,} distinct addresses", flush=True)

    print(f"  scan complete: {total_rows:,} rows → {len(buf):,} distinct donor addresses")

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout='300s'")
        cur.execute("TRUNCATE donor_addresses")
        execute_values(
            cur,
            "INSERT INTO donor_addresses (donor_slug, street_num, zip) VALUES %s "
            "ON CONFLICT (donor_slug, street_num, zip) DO NOTHING",
            buf,
            page_size=5000,
        )
    conn.commit()
    print("  donor_addresses loaded")

    # ── principal_addresses ─────────────────────────────────────────────────
    print("\nPopulating principal_addresses from fl_corporations exact-name joins …", flush=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout='180s'")
        cur.execute(
            """
            SELECT DISTINCT p.slug, c.address, c.zip, c.corp_number
            FROM principals p
            JOIN fl_corporations c ON c.entity_name = UPPER(p.name)
            WHERE c.address IS NOT NULL AND c.zip IS NOT NULL
            """
        )
        rows = cur.fetchall()

    p_buf: list[tuple[str, str, str, str | None]] = []
    p_seen: set[tuple[str, str, str]] = set()
    for slug, addr, zipcode, corp_num in rows:
        m = STREET_NUM_RE.match(addr or "")
        if not m:
            continue
        z = (zipcode or "")[:5]
        if not z.isdigit() or len(z) != 5:
            continue
        key = (slug, m.group(1), z)
        if key in p_seen:
            continue
        p_seen.add(key)
        p_buf.append((slug, m.group(1), z, corp_num))
    print(f"  {len(p_buf):,} distinct principal addresses")

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout='300s'")
        cur.execute("TRUNCATE principal_addresses")
        execute_values(
            cur,
            "INSERT INTO principal_addresses (principal_slug, street_num, zip, source_corp_number) VALUES %s "
            "ON CONFLICT (principal_slug, street_num, zip) DO NOTHING",
            p_buf,
            page_size=5000,
        )
    conn.commit()
    print("  principal_addresses loaded")

    # ── Refresh dependent MVs ───────────────────────────────────────────────
    # Two MVs need to be refreshed:
    # - contributor_to_donor_slug_mv (migration 050): aggregates 22M
    #   contributions rows into ~1M (contributor_name, donor_slug) pairs.
    #   Stale until refreshed; new contributions don't reach donor_principal
    #   _links_v otherwise.
    # - donor_principal_address_corroboration_v (migration 053): depends on
    #   donor_addresses + principal_addresses, both of which we just rewrote.
    #
    # Both refreshes use CONCURRENTLY which cannot run inside a transaction
    # block; psycopg2 wraps each cursor.execute() in one by default. Switch
    # the connection to autocommit explicitly for the refresh.
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            for mv in (
                "contributor_to_donor_slug_mv",
                "donor_principal_address_corroboration_v",
            ):
                print(f"\nRefreshing {mv} …", flush=True)
                try:
                    cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {mv}")
                except psycopg2.errors.ObjectNotInPrerequisiteState:
                    # First refresh after creation cannot be CONCURRENTLY.
                    cur.execute(f"REFRESH MATERIALIZED VIEW {mv}")
    finally:
        conn.autocommit = False

    # ── Summary ─────────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT donor_slug) FROM donor_addresses")
        print(f"\ndonor_addresses rows, distinct donors: {cur.fetchone()}")
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT principal_slug) FROM principal_addresses")
        print(f"principal_addresses rows, distinct principals: {cur.fetchone()}")
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT donor_slug), COUNT(DISTINCT principal_slug) FROM donor_principal_address_corroboration_v")
        print(f"corroboration_v rows, distinct donors, distinct principals: {cur.fetchone()}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
