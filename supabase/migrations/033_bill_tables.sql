-- Bill lobbying disclosures: which lobbyist/principal/firm disclosed work on each bill.
-- Populated by the LegiScan + FL lobbying disclosure pipeline.
CREATE TABLE IF NOT EXISTS bill_disclosures (
  id         SERIAL PRIMARY KEY,
  bill_slug  TEXT,
  bill_canon TEXT,
  lobbyist   TEXT,
  principal  TEXT,
  firm       TEXT,
  issues     TEXT,
  year       INTEGER
);

CREATE INDEX IF NOT EXISTS bill_disclosures_slug_idx ON bill_disclosures (bill_slug);
CREATE INDEX IF NOT EXISTS bill_disclosures_year_idx ON bill_disclosures (year);

-- Bill metadata: title, status, sponsor scraped from FL Senate index (script 99).
-- UNIQUE(bill_slug, year) — bill numbers reset each legislative session.
CREATE TABLE IF NOT EXISTS bill_info (
  id              SERIAL PRIMARY KEY,
  bill_slug       TEXT    NOT NULL,
  year            INTEGER NOT NULL,
  bill_canon      TEXT,
  title           TEXT,
  status          TEXT,
  last_action     TEXT,
  primary_sponsor TEXT,
  UNIQUE (bill_slug, year)
);

CREATE INDEX IF NOT EXISTS bi_slug_idx ON bill_info (bill_slug);
CREATE INDEX IF NOT EXISTS bi_year_idx ON bill_info (year);

-- Bill sponsorships from LegiScan (people_id → bill_id).
CREATE TABLE IF NOT EXISTS bill_sponsorships (
  id           SERIAL PRIMARY KEY,
  people_id    INTEGER NOT NULL,
  bill_id      INTEGER NOT NULL,
  bill_number  TEXT,
  bill_title   TEXT,
  sponsor_type TEXT,
  session_id   INTEGER,
  UNIQUE (people_id, bill_id, sponsor_type)
);

CREATE INDEX IF NOT EXISTS bs_people_idx ON bill_sponsorships (people_id);
CREATE INDEX IF NOT EXISTS bs_bill_idx   ON bill_sponsorships (bill_id);

-- Per-bill lobbying activity count (used by /lobbying/bills).
CREATE OR REPLACE VIEW bill_lobbyist_counts AS
SELECT bill_slug, year, COUNT(*) AS lobbyist_count
FROM bill_disclosures
GROUP BY bill_slug, year;

GRANT SELECT ON bill_disclosures   TO anon, authenticated;
GRANT SELECT ON bill_info          TO anon, authenticated;
GRANT SELECT ON bill_sponsorships  TO anon, authenticated;
GRANT SELECT ON bill_lobbyist_counts TO anon, authenticated;
