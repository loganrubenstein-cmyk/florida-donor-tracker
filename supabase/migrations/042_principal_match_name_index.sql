-- Index on upper(contributor_name) so loadDonor.js can query
-- principal_donation_matches by donor.name without a seq scan.
-- Before: 135K-row scan per donor page load when `.ilike('contributor_name', ...)`
-- has no wildcards (effectively an equality check).

CREATE INDEX IF NOT EXISTS idx_pdm_contributor_name_upper
  ON principal_donation_matches ((upper(contributor_name)));

-- Also add the case-insensitive pattern index for ilike with no wildcards.
-- PostgreSQL's planner will use this for `ilike value` (no %) after a schema
-- reload.
CREATE INDEX IF NOT EXISTS idx_pdm_contributor_name_lower
  ON principal_donation_matches ((lower(contributor_name)));

NOTIFY pgrst, 'reload schema';
