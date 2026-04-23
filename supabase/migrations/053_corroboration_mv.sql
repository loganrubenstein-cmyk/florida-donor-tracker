-- 053_corroboration_mv.sql
--
-- Promote donor_principal_address_corroboration_v from VIEW → MATERIALIZED VIEW.
-- The view re-aggregates 1.29M-row donor_addresses on every query (GROUP BY
-- street_num, zip for the noisy-filter CTE). Measured 8.3s on a cold prod
-- query from /api/follow?step=principals. The set is small (~12k rows) so
-- materializing is cheap; refresh runs alongside the donor_addresses rebuild
-- in scripts/108.

DROP VIEW IF EXISTS donor_principal_address_corroboration_v;

CREATE MATERIALIZED VIEW donor_principal_address_corroboration_v AS
WITH donor_addr_freq AS (
  SELECT street_num, zip, COUNT(DISTINCT donor_slug) AS n_donors
  FROM donor_addresses GROUP BY street_num, zip
),
principal_addr_freq AS (
  SELECT street_num, zip, COUNT(DISTINCT principal_slug) AS n_principals
  FROM principal_addresses GROUP BY street_num, zip
),
noisy AS (
  SELECT street_num, zip FROM donor_addr_freq WHERE n_donors > 50
  UNION
  SELECT street_num, zip FROM principal_addr_freq WHERE n_principals > 2
)
SELECT DISTINCT
  d.donor_slug,
  p.principal_slug,
  d.street_num,
  d.zip
FROM donor_addresses d
JOIN principal_addresses p USING (street_num, zip)
WHERE NOT EXISTS (
  SELECT 1 FROM noisy n
  WHERE n.street_num = d.street_num AND n.zip = d.zip
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dpac_mv_pk
  ON donor_principal_address_corroboration_v (donor_slug, principal_slug, street_num, zip);

CREATE INDEX IF NOT EXISTS idx_dpac_mv_donor
  ON donor_principal_address_corroboration_v (donor_slug);

CREATE INDEX IF NOT EXISTS idx_dpac_mv_principal
  ON donor_principal_address_corroboration_v (principal_slug);

COMMENT ON MATERIALIZED VIEW donor_principal_address_corroboration_v IS
  'Corroboration pairs, materialized so /api/follow?step=principals lookups stay sub-millisecond. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY at the end of scripts/108.';
