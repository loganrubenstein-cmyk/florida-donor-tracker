-- Independent expenditures (IE) and electioneering communications (EC).
-- Populated by scripts/23_scrape_independent_expenditures.py from FL Division of Elections.
-- 509,961 rows / $2.77B across 1,698 ECO committees (as of 2026-04-22).
-- support_oppose: 'S' = support, 'O' = oppose, NULL = not parseable from purpose text.

CREATE TABLE IF NOT EXISTS independent_expenditures (
  id             SERIAL PRIMARY KEY,
  committee_id   TEXT,
  committee_name TEXT,
  candidate_name TEXT,
  candidate_slug TEXT,
  support_oppose TEXT,          -- 'S' | 'O' | NULL
  amount         NUMERIC,
  expend_date    DATE,
  purpose        TEXT,
  office         TEXT,
  cycle          INTEGER,       -- calendar year of expenditure
  raw_year       INTEGER,       -- year from source filing
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ie_committee  ON independent_expenditures (committee_id);
CREATE INDEX IF NOT EXISTS idx_ie_candidate  ON independent_expenditures (candidate_slug);
CREATE INDEX IF NOT EXISTS idx_ie_cycle      ON independent_expenditures (cycle);
CREATE INDEX IF NOT EXISTS idx_ie_amount     ON independent_expenditures (amount DESC);

-- Per-committee totals with support/oppose breakdown.
CREATE OR REPLACE VIEW ie_committee_totals AS
SELECT
  committee_id,
  committee_name,
  SUM(amount)                                                   AS total_amount,
  COUNT(*)                                                      AS num_transactions,
  SUM(CASE WHEN support_oppose = 'S' THEN amount ELSE 0 END)   AS support_amount,
  SUM(CASE WHEN support_oppose = 'O' THEN amount ELSE 0 END)   AS oppose_amount,
  MIN(cycle)                                                    AS year_min,
  MAX(cycle)                                                    AS year_max
FROM independent_expenditures
GROUP BY committee_id, committee_name;

-- Per-year totals with support/oppose breakdown.
CREATE OR REPLACE VIEW ie_year_totals AS
SELECT
  cycle,
  SUM(amount)                                                   AS total_amount,
  COUNT(*)                                                      AS num_transactions,
  COUNT(DISTINCT committee_name)                                AS num_committees,
  SUM(CASE WHEN support_oppose = 'S' THEN amount ELSE 0 END)   AS support_amount,
  SUM(CASE WHEN support_oppose = 'O' THEN amount ELSE 0 END)   AS oppose_amount
FROM independent_expenditures
GROUP BY cycle
ORDER BY cycle;

GRANT SELECT ON ie_committee_totals TO anon, authenticated;
GRANT SELECT ON ie_year_totals      TO anon, authenticated;
