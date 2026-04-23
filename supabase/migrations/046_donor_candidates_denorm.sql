-- Denormalizes candidate metadata into donor_candidates so PostgREST doesn't
-- need to resolve a candidates() embed on an aggregating view (PGRST200).
--
-- Before: view had (donor_slug, acct_num, candidate_name, total, num_contributions).
--   /api/bipartisan queried party_code from the view and got null for every row.
--   /donor/[slug] tried to embed candidates(office_desc, party_code, election_year)
--     and silently got null for all three fields (PGRST200 on the embed).
--
-- After: view directly includes party_code, office_desc, election_year via the
-- existing LEFT JOIN to candidates.

-- CREATE OR REPLACE VIEW can only append columns; preserve original column
-- order (donor_slug, acct_num, candidate_name, total, num_contributions) and
-- append party_code/office_desc/election_year at the end.
CREATE OR REPLACE VIEW public.donor_candidates AS
SELECT
  c.donor_slug,
  c.recipient_acct         AS acct_num,
  MAX(cand.candidate_name) AS candidate_name,
  SUM(c.amount)            AS total,
  COUNT(*)                 AS num_contributions,
  MAX(cand.party_code)     AS party_code,
  MAX(cand.office_desc)    AS office_desc,
  MAX(cand.election_year)  AS election_year
FROM contributions c
LEFT JOIN candidates cand ON cand.acct_num = c.recipient_acct
WHERE c.donor_slug IS NOT NULL
  AND c.recipient_type = 'candidate'::text
GROUP BY c.donor_slug, c.recipient_acct;

NOTIFY pgrst, 'reload schema';
