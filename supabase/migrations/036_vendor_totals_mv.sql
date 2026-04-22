-- Materialized view: total payments per canonical vendor across both
-- committee expenditures and candidate expenditures tables.
-- Used by /vendor/[slug] profile pages.
-- Refresh with: REFRESH MATERIALIZED VIEW vendor_totals_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS vendor_totals_mv AS
WITH combined AS (
  SELECT vendor_canonical_slug AS slug, amount
  FROM expenditures
  WHERE vendor_canonical_slug IS NOT NULL
  UNION ALL
  SELECT vendor_canonical_slug AS slug, amount
  FROM candidate_expenditures
  WHERE vendor_canonical_slug IS NOT NULL
)
SELECT
  ve.canonical_slug                                    AS slug,
  ve.canonical_name                                    AS name,
  ve.is_government,
  ve.is_franchise,
  COALESCE(SUM(c.amount), 0)::NUMERIC(15,2)            AS total_amount,
  COUNT(c.amount)::INTEGER                             AS num_payments
FROM vendor_entities ve
LEFT JOIN combined c ON c.slug = ve.canonical_slug
GROUP BY ve.canonical_slug, ve.canonical_name, ve.is_government, ve.is_franchise;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_totals_mv_slug_idx ON vendor_totals_mv (slug);

GRANT SELECT ON vendor_totals_mv TO anon, authenticated;
