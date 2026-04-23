-- 050_donor_principal_links_via_contributions.sql
--
-- Root-cause fix for donor→principal matching. Prior versions (047, 048)
-- joined principal_donation_matches.contributor_name directly to donors_mv.name,
-- which fails when donor deduplication has collapsed several contributor
-- variants into one canonical donor. Example: donor slug 'florida-realtors'
-- aggregates contributions from names like "FLORIDA REALTORS POLITICAL ACTION
-- PLAN" and "FLA. ASSOCIATION OF REALTORS ADVOCACY FUND" — the pdm row has
-- the raw contributor string but the donors_mv row carries the deduped form.
--
-- The authoritative contributor→donor mapping lives in contributions. This
-- migration materializes a compact lookup from that source, then rebuilds
-- donor_principal_links_v to join through it.
--
-- Side effect: the 'direct' branch from migration 048 is no longer needed.
-- The new join path subsumes it cleanly — any principal whose name equals a
-- donor name (AT&T, 3M, Florida Realtors) now flows through the fuzzy match
-- pipeline + contribution mapping with no special-case UNION.

CREATE MATERIALIZED VIEW IF NOT EXISTS contributor_to_donor_slug_mv AS
SELECT DISTINCT
  UPPER(contributor_name) AS contributor_name_upper,
  donor_slug
FROM contributions
WHERE donor_slug IS NOT NULL
  AND contributor_name IS NOT NULL
  AND contributor_name <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ctds_mv_pk
  ON contributor_to_donor_slug_mv (contributor_name_upper, donor_slug);

CREATE INDEX IF NOT EXISTS idx_ctds_mv_donor
  ON contributor_to_donor_slug_mv (donor_slug);

COMMENT ON MATERIALIZED VIEW contributor_to_donor_slug_mv IS
  'Authoritative contributor_name (UPPER) → donor_slug lookup, distilled from contributions. Needed because principal_donation_matches stores raw contributor strings but downstream consumers want canonical donor slugs. Refresh via REFRESH MATERIALIZED VIEW after donor deduplication or large contribution loads.';

DROP VIEW IF EXISTS donor_principal_links_v;

CREATE VIEW donor_principal_links_v AS
-- Path 1: fuzzy pdm match routed through contributions for donor-side dedup.
--         Handles contributor variants that the deduper collapsed (e.g.
--         "FLA. ASSN OF REALTORS ADVOCACY FUND" → donor_slug=florida-realtors).
SELECT
  ctds.donor_slug                 AS donor_slug,
  d.name                          AS donor_name,
  p.slug                          AS principal_slug,
  p.name                          AS principal_name,
  pdm.match_score,
  'contributions'::text           AS source
FROM principal_donation_matches pdm
JOIN contributor_to_donor_slug_mv ctds
  ON ctds.contributor_name_upper = UPPER(pdm.contributor_name)
JOIN donors_mv d ON d.slug = ctds.donor_slug
JOIN principals p ON p.slug = pdm.principal_slug
WHERE pdm.match_score >= 85
UNION
-- Path 2: fuzzy pdm match where pdm.contributor_name directly equals a
--         donors_mv.name. Catches donors whose canonical name happens to
--         match a pdm contributor string but whose contributions rows use
--         a different raw form (historical / reaggregated donor rows).
SELECT
  d.slug,
  d.name,
  p.slug,
  p.name,
  pdm.match_score,
  'name_match'::text              AS source
FROM principal_donation_matches pdm
JOIN donors_mv d ON UPPER(d.name) = UPPER(pdm.contributor_name)
JOIN principals p ON p.slug = pdm.principal_slug
WHERE pdm.match_score >= 85
UNION
-- Path 3: direct name/slug equality between principals and donors_mv, outside
--         the matcher. Covers principals whose matching donor was never
--         indexed in pdm at all (e.g. self-funded PACs, principals whose
--         contributions all aggregate under a different canonical name).
SELECT
  d.slug,
  d.name,
  p.slug,
  p.name,
  100.00::numeric                 AS match_score,
  'direct'::text                  AS source
FROM principals p
JOIN donors_mv d
  ON UPPER(d.name) = UPPER(p.name)
  OR d.slug = p.slug;

COMMENT ON VIEW donor_principal_links_v IS
  'Donor→Principal bridge for /follow. Three paths UNIONed — (1) contributions lookup for donor-side deduplication of variant contributor names, (2) direct pdm.contributor_name to donors_mv.name match for canonical-name cases, (3) principal/donor name or slug equality for principals with no pdm row. Consumers should group by (donor_slug, principal_slug) and take MAX(match_score).';
