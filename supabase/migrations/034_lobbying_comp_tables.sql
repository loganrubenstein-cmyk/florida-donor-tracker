-- Lobbying compensation detail: raw row per firm/lobbyist/principal/quarter.
-- 4M rows, 19 years (2006–2024). Populated by scripts 87–91.
-- comp_range: e.g. "$10,000 - $29,999"; comp_midpoint: midpoint in dollars.
CREATE TABLE IF NOT EXISTS lobbyist_comp_detail (
  id             SERIAL PRIMARY KEY,
  firm_name      TEXT,
  lobbyist_name  TEXT,
  principal_name TEXT NOT NULL,
  comp_range     TEXT,
  comp_midpoint  NUMERIC DEFAULT 0,
  quarter        SMALLINT,
  year           SMALLINT,
  branch         TEXT    -- 'L' (legislative) | 'E' (executive)
);

CREATE INDEX IF NOT EXISTS lcd_firm_idx      ON lobbyist_comp_detail (firm_name);
CREATE INDEX IF NOT EXISTS lcd_lobbyist_idx  ON lobbyist_comp_detail (lobbyist_name);
CREATE INDEX IF NOT EXISTS lcd_principal_idx ON lobbyist_comp_detail (principal_name);
CREATE INDEX IF NOT EXISTS lcd_year_q_idx    ON lobbyist_comp_detail (year, quarter);

-- Per-principal annual rollup (used by principal profiles and influence index).
CREATE TABLE IF NOT EXISTS lobbyist_principal_comp (
  id             BIGSERIAL PRIMARY KEY,
  principal_slug TEXT    NOT NULL,
  principal_name TEXT    NOT NULL,
  year           INTEGER NOT NULL,
  quarter        INTEGER NOT NULL,
  branch         TEXT    NOT NULL,
  total_comp     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lpc_slug ON lobbyist_principal_comp (principal_slug);
CREATE INDEX IF NOT EXISTS idx_lpc_year ON lobbyist_principal_comp (year, quarter);

-- Annual totals per firm (used by lobbying firm profiles).
CREATE TABLE IF NOT EXISTS lobby_firm_annual (
  firm_name      TEXT,
  year           SMALLINT,
  total_comp     NUMERIC,
  num_principals BIGINT,
  num_lobbyists  BIGINT,
  num_records    BIGINT
);

-- Annual totals per lobbyist.
CREATE TABLE IF NOT EXISTS lobby_lobbyist_annual (
  lobbyist_name  TEXT,
  firm_name      TEXT,
  year           SMALLINT,
  total_comp     NUMERIC,
  num_principals BIGINT,
  num_records    BIGINT
);

-- Annual totals per principal (with leg/exec branch split).
CREATE TABLE IF NOT EXISTS lobby_principal_annual (
  principal_name TEXT,
  year           SMALLINT,
  total_comp     NUMERIC,
  leg_comp       NUMERIC,
  exec_comp      NUMERIC,
  num_firms      BIGINT,
  num_lobbyists  BIGINT,
  num_records    BIGINT
);

-- Issue-level aggregates across all years.
CREATE TABLE IF NOT EXISTS lobby_issue_summary (
  issue             TEXT,
  total_disclosures BIGINT,
  num_principals    BIGINT,
  num_lobbyists     BIGINT,
  num_firms         BIGINT,
  num_bills         BIGINT,
  earliest_year     INTEGER,
  latest_year       INTEGER
);

-- Issue-level aggregates by year.
CREATE TABLE IF NOT EXISTS lobby_issue_by_year (
  issue       TEXT,
  year        INTEGER,
  disclosures BIGINT,
  principals  BIGINT,
  lobbyists   BIGINT,
  bills       BIGINT
);

-- Principal influence index: combines donation total + lobbying comp.
-- Used by /influence and principal directory sorting.
CREATE OR REPLACE VIEW principal_influence_index AS
SELECT
  p.id,
  p.slug,
  p.name,
  p.industry,
  COALESCE(p.donation_total,       0) AS donation_total,
  COALESCE(lpa.total_lobby_comp,   0) AS total_lobby_comp,
  (COALESCE(p.donation_total, 0) + COALESCE(lpa.total_lobby_comp, 0)) AS total_influence,
  COALESCE(lpa.active_years,       0) AS active_years,
  COALESCE(p.num_contributions,    0) AS num_contributions
FROM principals p
LEFT JOIN (
  SELECT principal_name,
         SUM(total_comp)              AS total_lobby_comp,
         COUNT(DISTINCT year)         AS active_years
  FROM lobby_principal_annual
  GROUP BY principal_name
) lpa ON lpa.principal_name = p.name;

GRANT SELECT ON lobbyist_comp_detail    TO anon, authenticated;
GRANT SELECT ON lobbyist_principal_comp TO anon, authenticated;
GRANT SELECT ON lobby_firm_annual       TO anon, authenticated;
GRANT SELECT ON lobby_lobbyist_annual   TO anon, authenticated;
GRANT SELECT ON lobby_principal_annual  TO anon, authenticated;
GRANT SELECT ON lobby_issue_summary     TO anon, authenticated;
GRANT SELECT ON lobby_issue_by_year     TO anon, authenticated;
GRANT SELECT ON principal_influence_index TO anon, authenticated;
