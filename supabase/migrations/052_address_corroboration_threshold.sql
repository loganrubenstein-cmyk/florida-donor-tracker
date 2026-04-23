-- 052_address_corroboration_threshold.sql
--
-- Relax the donor-count threshold in donor_principal_address_corroboration_v
-- from 20 → 50. The 20 threshold was stripping legitimate cases like FPL:
-- 700 Universe Blvd (Juno Beach, zip 33408) is shared by 26 donor_slugs —
-- employees and subsidiaries of FPL, not a mail-drop aggregator. Real
-- mail-drop / processing addresses have thousands of donors (Kissimmee
-- 8505 zip 34747 has 132k; Tallahassee 300 zip 32301 has 24k), so 50 is
-- safely below those while admitting HQ + affiliates clusters.
--
-- Principal threshold (>2) unchanged — shared office towers remain noise.

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
