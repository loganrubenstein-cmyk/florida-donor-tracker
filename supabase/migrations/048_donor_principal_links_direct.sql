-- 048_donor_principal_links_direct.sql
-- Extend donor_principal_links_v with a direct-equality branch.
--
-- Audit of the 676 principals unmatched by migration 047 revealed that the
-- upstream principal_donation_matches loader has gaps — e.g. principal 'AT&T'
-- (slug=att) has ZERO rows in principal_donation_matches, even though donor
-- 'AT&T' (slug=att, $7.3M combined) exists with the identical slug. The
-- fuzzy-match loader appears to skip short names or names containing '&'.
--
-- Rather than fix the upstream loader (touches scripts 21/22 which are T1's
-- territory for the current sprint) we add a second branch to the view that
-- picks up principals whose UPPER(name) or slug equals a donor's. This
-- recovers 24 additional principals (biggest wins: AT&T, AT&T Florida,
-- CF Industries, AIG, 3M, Scholastic, American Eldercare).
--
-- A `source` column is added so consumers can distinguish 'fuzzy_match' vs
-- 'direct'. UNION de-duplicates exact matches; when both paths hit the same
-- (donor, principal) pair with different scores, both rows appear and the
-- consumer should take the max score.

DROP VIEW IF EXISTS donor_principal_links_v;

CREATE VIEW donor_principal_links_v AS
-- Fuzzy path: principal_donation_matches >= 85
SELECT
  d.slug                  AS donor_slug,
  d.name                  AS donor_name,
  p.slug                  AS principal_slug,
  p.name                  AS principal_name,
  pdm.match_score,
  'fuzzy_match'::text     AS source
FROM principal_donation_matches pdm
JOIN donors_mv d   ON UPPER(d.name) = UPPER(pdm.contributor_name)
JOIN principals p  ON p.slug = pdm.principal_slug
WHERE pdm.match_score >= 85
UNION
-- Direct path: exact name or slug equality (catches pdm gaps like AT&T)
SELECT
  d.slug,
  d.name,
  p.slug,
  p.name,
  100.00::numeric         AS match_score,
  'direct'::text          AS source
FROM principals p
JOIN donors_mv d
  ON UPPER(d.name) = UPPER(p.name)
  OR d.slug = p.slug;

COMMENT ON VIEW donor_principal_links_v IS
  'Donor→Principal bridge for /follow. Two sources: fuzzy_match (principal_donation_matches >= 85) and direct (slug or UPPER(name) equality). Direct branch closes pdm loader gaps for short/special-char names. total_donated/num_contributions intentionally excluded — those columns in pdm aggregate per-principal, not per-(donor,principal). Compute donor spend from contributions directly.';
