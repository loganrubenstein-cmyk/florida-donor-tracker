-- 049_principal_lobbied_bills.sql
-- Phase 2 of /follow dream use case: bridge principal → bill.
--
-- Source: public/data/lobbyist_disclosures/by_bill/*.json (per-filing records
-- loaded by scripts/107_load_principal_lobbied_bills.py).
--
-- bill_slug normalizes to the same form as lib/fmt.js billNumberToSlug():
--   'HB 1019' → 'hb-1019'   'SB 282' → 'sb-282'
-- session_year is the biennium start (odd year) so HB 1019 from 2023-24 is
-- distinct from HB 1019 from 2025-26.
-- position is always NULL today — the lobby disclosure filings don't state
-- support/oppose; column is reserved so a future ethics-filing loader can
-- populate it without schema churn.

CREATE TABLE IF NOT EXISTS principal_lobbied_bills (
  principal_slug  TEXT    NOT NULL,
  bill_slug       TEXT    NOT NULL,
  bill_number     TEXT    NOT NULL,
  session_year    INT     NOT NULL,
  filing_count    INT     NOT NULL DEFAULT 0,
  years           INT[]   NOT NULL DEFAULT '{}',
  position        TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (principal_slug, bill_slug, session_year)
);

COMMENT ON TABLE principal_lobbied_bills IS
  'Denormalized principal→bill filings derived from by_bill/*.json. bill_slug matches lib/fmt.js billNumberToSlug format. session_year = biennium start (odd year). position reserved for future ethics-filing loader.';

CREATE INDEX IF NOT EXISTS idx_plb_bill_session
  ON principal_lobbied_bills (bill_slug, session_year);

CREATE INDEX IF NOT EXISTS idx_plb_principal
  ON principal_lobbied_bills (principal_slug);
