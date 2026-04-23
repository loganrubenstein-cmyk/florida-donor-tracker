-- 047_donor_principal_links.sql
-- Phase 1 of /follow "dream use case": expose donor → principal links as a view.
--
-- principal_donation_matches already holds 135,884 fuzzy-matched rows keyed by
-- (principal_slug, contributor_name). donors_mv holds canonical donor rows.
-- This view joins the two so /follow can answer "which principals match this
-- donor?" without client-side fuzzy logic.
--
-- Threshold 85 drops the noisiest fuzzy matches (see principal_donation_matches
-- match_score distribution — <85 is overwhelmingly false positives like
-- "FLORIDA CULTURAL ALLIANCE" → "THE FLORIDA ALLIANCE").

CREATE OR REPLACE VIEW donor_principal_links_v AS
SELECT
  d.slug                    AS donor_slug,
  d.name                    AS donor_name,
  p.slug                    AS principal_slug,
  p.name                    AS principal_name,
  pdm.match_score
FROM principal_donation_matches pdm
JOIN donors_mv d   ON UPPER(d.name) = UPPER(pdm.contributor_name)
JOIN principals p  ON p.slug = pdm.principal_slug
WHERE pdm.match_score >= 85;

COMMENT ON VIEW donor_principal_links_v IS
  'Donor→Principal bridge for /follow. Joins principal_donation_matches (fuzzy) with donors_mv + principals. Threshold match_score>=85 drops noise. Note: total_donated / num_contributions were intentionally excluded — those columns in principal_donation_matches are aggregated per-principal, not per-(donor,principal), and would mislead consumers. Compute donor-level spend from contributions directly.';

-- Supporting index to make donor-side lookup fast.
-- donors_mv.name is already trigram-indexed (migration 042); we need a
-- functional UPPER(name) btree to speed the equality join here.
CREATE INDEX IF NOT EXISTS idx_donors_mv_upper_name
  ON donors_mv (UPPER(name));

CREATE INDEX IF NOT EXISTS idx_pdm_upper_contributor
  ON principal_donation_matches (UPPER(contributor_name));
