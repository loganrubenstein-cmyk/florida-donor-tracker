-- Shadow organizations: 527s, 501(c)(4)s, and other outside-money vehicles
-- linked to FL candidates. Populated by scripts 92/93/96.
-- Migration 018 added source columns via ALTER TABLE; this creates the base table.
CREATE TABLE IF NOT EXISTS shadow_orgs (
  id                  SERIAL  PRIMARY KEY,
  org_name            TEXT    NOT NULL,
  org_slug            TEXT    NOT NULL UNIQUE,
  stub_type           TEXT,
  irs_ein             TEXT,
  irs_name            TEXT,
  irs_status          TEXT,
  irs_ntee_code       TEXT,
  pp_total_revenue    NUMERIC,
  pp_total_expenses   NUMERIC,
  pp_total_assets     NUMERIC,
  pp_filing_year      INTEGER,
  pp_url              TEXT,
  matched_candidates  TEXT,
  num_candidates      INTEGER DEFAULT 0,
  match_method        TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now(),
  fec_source          TEXT,
  fec_committee_id    TEXT,
  fec_name            TEXT,
  fec_match_score     INTEGER,
  fec_total_receipts  NUMERIC,
  fec_total_disb      NUMERIC,
  fec_latest_year     INTEGER,
  irs_8871_ein        TEXT,
  irs_8871_name       TEXT,
  irs_8871_score      INTEGER,
  fl_acct_num         TEXT,
  source_url          TEXT,
  source_filing_date  DATE,
  fec_filing_url      TEXT,
  irs_filing_url      TEXT
);

CREATE INDEX IF NOT EXISTS idx_shadow_orgs_slug    ON shadow_orgs (org_slug);
CREATE INDEX IF NOT EXISTS idx_shadow_orgs_type    ON shadow_orgs (stub_type);
CREATE INDEX IF NOT EXISTS idx_shadow_orgs_revenue ON shadow_orgs (pp_total_revenue DESC NULLS LAST);

-- Official financial disclosures (Form 6) scraped from FL Ethics Commission.
-- Populated by scripts that parse EFDMS PDFs.
CREATE TABLE IF NOT EXISTS official_disclosures (
  id                  SERIAL PRIMARY KEY,
  filer_name          TEXT,
  filer_slug          TEXT,
  position            TEXT,
  filing_year         INTEGER,
  filing_type         TEXT,
  income_sources      JSONB,
  real_estate         JSONB,
  business_interests  JSONB,
  liabilities         JSONB,
  source_url          TEXT,
  pdf_local_path      TEXT,
  legislator_id       INTEGER,
  raw_text_length     INTEGER,
  net_worth           NUMERIC,
  scraped_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (filer_slug, filing_year, filing_type)
);

CREATE INDEX IF NOT EXISTS idx_official_disclosures_legislator ON official_disclosures (legislator_id);
CREATE INDEX IF NOT EXISTS idx_official_disclosures_year       ON official_disclosures (filing_year DESC);

-- Email signups collected from site CTAs.
CREATE TABLE IF NOT EXISTS email_signups (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT        NOT NULL UNIQUE,
  context    TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_signups_context_idx    ON email_signups (context);
CREATE INDEX IF NOT EXISTS email_signups_created_at_idx ON email_signups (created_at DESC);

GRANT SELECT ON shadow_orgs          TO anon, authenticated;
GRANT SELECT ON official_disclosures TO anon, authenticated;
-- email_signups: anon INSERT only (no SELECT — signups are private)
GRANT INSERT ON email_signups TO anon;
GRANT SELECT, INSERT, UPDATE ON email_signups TO authenticated;
