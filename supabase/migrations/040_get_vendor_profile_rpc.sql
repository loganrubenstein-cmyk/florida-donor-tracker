-- Captures the get_vendor_profile(p_slug text) RPC that exists live but was
-- never committed as a migration. lib/loadVendor.js depends on this function;
-- without it the vendor profile page errors. Fetched from pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.get_vendor_profile(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
WITH
  ve AS (
    SELECT canonical_slug, canonical_name, is_government, is_franchise
    FROM vendor_entities
    WHERE canonical_slug = p_slug
  ),
  exp_tot AS (
    SELECT COALESCE(SUM(amount),0)::numeric AS total, COUNT(*)::int AS n
    FROM expenditures WHERE vendor_canonical_slug = p_slug
  ),
  cand_tot AS (
    SELECT COALESCE(SUM(amount),0)::numeric AS total, COUNT(*)::int AS n
    FROM candidate_expenditures WHERE vendor_canonical_slug = p_slug
  ),
  by_committee AS (
    SELECT e.acct_num, c.committee_name,
           SUM(e.amount)::numeric AS total,
           COUNT(*)::int AS num_payments
    FROM expenditures e
    LEFT JOIN committees c ON c.acct_num = e.acct_num
    WHERE e.vendor_canonical_slug = p_slug
    GROUP BY e.acct_num, c.committee_name
    ORDER BY SUM(e.amount) DESC
    LIMIT 25
  ),
  by_candidate AS (
    SELECT e.acct_num, ca.candidate_name,
           SUM(e.amount)::numeric AS total,
           COUNT(*)::int AS num_payments
    FROM candidate_expenditures e
    LEFT JOIN candidates ca ON ca.acct_num = e.acct_num
    WHERE e.vendor_canonical_slug = p_slug
    GROUP BY e.acct_num, ca.candidate_name
    ORDER BY SUM(e.amount) DESC
    LIMIT 25
  ),
  by_year AS (
    SELECT yr AS report_year, SUM(amount)::numeric AS total, COUNT(*)::int AS n
    FROM (
      SELECT report_year AS yr, amount FROM expenditures WHERE vendor_canonical_slug = p_slug
      UNION ALL
      SELECT report_year, amount FROM candidate_expenditures WHERE vendor_canonical_slug = p_slug
    ) u
    WHERE yr IS NOT NULL
    GROUP BY yr
    ORDER BY yr
  ),
  aliases AS (
    SELECT alias_text_display
    FROM vendor_aliases
    WHERE canonical_slug = p_slug
    ORDER BY alias_text_display
    LIMIT 50
  )
SELECT jsonb_build_object(
  'entity',      (SELECT to_jsonb(ve) FROM ve),
  'totals', jsonb_build_object(
     'committee_total',    (SELECT total FROM exp_tot),
     'committee_payments', (SELECT n FROM exp_tot),
     'candidate_total',    (SELECT total FROM cand_tot),
     'candidate_payments', (SELECT n FROM cand_tot)
  ),
  'by_committee', COALESCE((SELECT jsonb_agg(to_jsonb(bc)) FROM by_committee bc), '[]'::jsonb),
  'by_candidate', COALESCE((SELECT jsonb_agg(to_jsonb(bd)) FROM by_candidate bd), '[]'::jsonb),
  'by_year',      COALESCE((SELECT jsonb_agg(to_jsonb(by)) FROM by_year by), '[]'::jsonb),
  'aliases',      COALESCE((SELECT jsonb_agg(alias_text_display) FROM aliases), '[]'::jsonb)
);
$function$;

NOTIFY pgrst, 'reload schema';
