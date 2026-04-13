-- 014_politicians_canonical.sql
-- Materialized view: one row per politician, aggregated across all election cycles.
-- Used by: app/api/politicians/route.js (candidates directory) and legislator import scripts.

DROP MATERIALIZED VIEW IF EXISTS politicians_canonical;

CREATE MATERIALIZED VIEW politicians_canonical AS
WITH
  -- Assign a row number per name_key ordered by most recent cycle, then highest acct_num as tiebreaker
  ranked AS (
    SELECT
      UPPER(TRIM(candidate_name))                          AS name_key,
      candidate_name,
      party_code,
      office_desc,
      district,
      acct_num,
      election_year,
      ROW_NUMBER() OVER (
        PARTITION BY UPPER(TRIM(candidate_name))
        ORDER BY election_year DESC, acct_num DESC
      )                                                    AS rn
    FROM candidates
    WHERE candidate_name IS NOT NULL
  ),

  -- Latest row per politician (rn = 1)
  latest AS (
    SELECT
      name_key,
      candidate_name  AS display_name,
      party_code      AS party,
      office_desc     AS latest_office,
      district        AS latest_district,
      acct_num        AS latest_acct_num
    FROM ranked
    WHERE rn = 1
  ),

  -- Aggregates across all cycles per politician
  aggs AS (
    SELECT
      UPPER(TRIM(candidate_name))                          AS name_key,
      MIN(election_year)                                   AS earliest_cycle,
      MAX(election_year)                                   AS latest_cycle,
      COUNT(*)                                             AS num_cycles,
      SUM(COALESCE(hard_money_total, 0))                   AS hard_money_all,
      SUM(COALESCE(soft_money_total, 0))                   AS soft_money_all,
      -- Ambiguity: multiple distinct parties AND cycle span > 12 years
      COALESCE(
        COUNT(DISTINCT party_code) > 1
        AND (MAX(election_year) - MIN(election_year)) > 12,
        false
      )                                                    AS is_ambiguous
    FROM candidates
    WHERE candidate_name IS NOT NULL
    GROUP BY UPPER(TRIM(candidate_name))
  )

SELECT
  l.name_key,
  l.display_name,
  l.party,
  l.latest_office,
  l.latest_district,
  l.latest_acct_num,
  a.earliest_cycle,
  a.latest_cycle,
  a.num_cycles,
  a.hard_money_all,
  a.soft_money_all,
  a.hard_money_all + a.soft_money_all                      AS total_combined_all,
  a.is_ambiguous
FROM latest l
JOIN aggs a USING (name_key);

-- UNIQUE index on name_key — required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX politicians_canonical_name_key_idx
  ON politicians_canonical (name_key);

-- Default sort index (candidates directory sorts by total raised descending)
CREATE INDEX politicians_canonical_total_combined_all_idx
  ON politicians_canonical (total_combined_all DESC);

-- Search/filter index on display_name
CREATE INDEX politicians_canonical_display_name_idx
  ON politicians_canonical (display_name);
