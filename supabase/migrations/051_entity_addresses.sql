-- 051_entity_addresses.sql
--
-- Address-based entity linking — backend corroboration only. This does NOT
-- alter donor_principal_links_v. It adds tools a name-match consumer can use
-- to check whether a (donor, principal) pair is also address-corroborated.
--
-- Addresses change over time. Treat address agreement as a positive signal
-- that raises confidence in a name match, not as ground truth. Absence of
-- address match is NOT evidence the name match is wrong.
--
-- Three helpers:
--   1. donor_addresses_mv     — (donor_slug, street_num, zip) from contributions
--   2. principal_addresses_mv — (principal_slug, street_num, zip) via exact-
--                               name link to fl_corporations
--   3. donor_principal_address_corroboration_v — (donor_slug, principal_slug)
--                               pairs that share at least one street_num+zip.
--                               Join to donor_principal_links_v to add an
--                               address_corroborated boolean.
--
-- street_num is the leading run of digits from the street address; combined
-- with 5-digit zip it's a high-precision blocking key that survives most
-- formatting variance ("215 S MONROE STREET, SUITE 810" and
-- "215 S. MONROE ST, STE 810" both hash to ('215', '32301')).

CREATE TABLE IF NOT EXISTS donor_addresses (
  donor_slug TEXT NOT NULL,
  street_num TEXT NOT NULL,
  zip        TEXT NOT NULL,
  PRIMARY KEY (donor_slug, street_num, zip)
);

CREATE INDEX IF NOT EXISTS idx_donor_addresses_street_zip
  ON donor_addresses (street_num, zip);

CREATE TABLE IF NOT EXISTS principal_addresses (
  principal_slug TEXT NOT NULL,
  street_num     TEXT NOT NULL,
  zip            TEXT NOT NULL,
  source_corp_number TEXT,
  PRIMARY KEY (principal_slug, street_num, zip)
);

CREATE INDEX IF NOT EXISTS idx_principal_addresses_street_zip
  ON principal_addresses (street_num, zip);

CREATE OR REPLACE VIEW donor_principal_address_corroboration_v AS
WITH donor_addr_freq AS (
  SELECT street_num, zip, COUNT(DISTINCT donor_slug) AS n_donors
  FROM donor_addresses GROUP BY street_num, zip
),
principal_addr_freq AS (
  SELECT street_num, zip, COUNT(DISTINCT principal_slug) AS n_principals
  FROM principal_addresses GROUP BY street_num, zip
),
noisy AS (
  -- Exclude addresses shared by many donors (mail drops, processing centers)
  -- or multiple principals (shared lobbying office buildings). The thresholds
  -- are deliberately conservative — 20 donors already signals a service
  -- address, 2+ principals signals a shared office tower in Tallahassee.
  SELECT street_num, zip FROM donor_addr_freq WHERE n_donors > 20
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

COMMENT ON VIEW donor_principal_address_corroboration_v IS
  'Backend corroboration tool. A row means donor X and principal Y have at least one (street_num, zip) pair in common. Use only to raise confidence on name-match links — address absence is NOT evidence against a name match (addresses change; lobbying HQ often differs from corporate HQ).';

COMMENT ON TABLE donor_addresses IS
  'Normalized (street_num, zip) pairs per donor_slug, populated by scripts/108_build_entity_addresses.py from contributions. Re-run when new contributions load.';

COMMENT ON TABLE principal_addresses IS
  'Normalized (street_num, zip) pairs per principal_slug. Populated by scripts/108_build_entity_addresses.py via exact-name match from principals.name to fl_corporations.entity_name. Only the 318 principals with exact FL corporate registrations are seeded today; fuzzy expansion is future work.';
