-- Migration 023: Lobbyist registrations (current-year PDF parse)
-- Source: scripts/14c_parse_registration_pdfs.py → data/processed/lobbyist_registrations.csv
-- One row per (lobbyist, principal) pair per branch per year. Carries the fields
-- the comp TXT files do NOT have: lobbyist phone + address, per-pair effective
-- date, NAICS industry_code, and chamber scope.

CREATE TABLE IF NOT EXISTS lobbyist_registrations (
  id              bigserial PRIMARY KEY,
  year            smallint NOT NULL,
  branch          text NOT NULL,
  lobbyist_name   text NOT NULL,
  lobbyist_phone  text,
  lobbyist_addr   text,
  principal_name  text NOT NULL,
  principal_addr  text,
  industry_code   text,
  chamber_scope   text,
  effective_date  date,
  source_url      text,
  retrieved_at    timestamptz DEFAULT now(),
  UNIQUE (year, branch, lobbyist_name, principal_name)
);

CREATE INDEX IF NOT EXISTS lobreg_year_idx
  ON lobbyist_registrations (year);
CREATE INDEX IF NOT EXISTS lobreg_lobbyist_idx
  ON lobbyist_registrations (lobbyist_name);
CREATE INDEX IF NOT EXISTS lobreg_principal_idx
  ON lobbyist_registrations (principal_name);
CREATE INDEX IF NOT EXISTS lobreg_industry_idx
  ON lobbyist_registrations (industry_code);
CREATE INDEX IF NOT EXISTS lobreg_lobbyist_trgm
  ON lobbyist_registrations USING gin (lobbyist_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS lobreg_principal_trgm
  ON lobbyist_registrations USING gin (principal_name gin_trgm_ops);
