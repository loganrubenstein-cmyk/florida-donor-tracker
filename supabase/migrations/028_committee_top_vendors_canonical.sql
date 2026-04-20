-- 028_committee_top_vendors_canonical.sql
-- Rebuild committee_top_vendors grouped by vendor_canonical_slug
-- so aliased vendor names (FPL variants, etc.) roll up into one row.

ALTER TABLE committee_top_vendors
  ADD COLUMN IF NOT EXISTS vendor_canonical_slug text;

CREATE INDEX IF NOT EXISTS idx_comm_top_vendors_slug
  ON committee_top_vendors(vendor_canonical_slug);

TRUNCATE committee_top_vendors;

WITH agg AS (
  SELECT
    e.acct_num,
    e.vendor_canonical_slug,
    COALESCE(ve.canonical_name, MIN(e.vendor_name))   AS display_name,
    SUM(e.amount)::numeric(15,2)                       AS total_amount,
    COUNT(*)::int                                      AS num_payments
  FROM expenditures e
  LEFT JOIN vendor_entities ve
    ON ve.canonical_slug = e.vendor_canonical_slug
  WHERE e.vendor_canonical_slug IS NOT NULL
  GROUP BY e.acct_num, e.vendor_canonical_slug, ve.canonical_name
),
comm_tot AS (
  SELECT acct_num, SUM(total_amount) AS committee_total
  FROM agg
  GROUP BY acct_num
),
ranked AS (
  SELECT
    a.acct_num,
    a.display_name                  AS vendor_name,
    a.vendor_canonical_slug,
    a.total_amount,
    a.num_payments,
    ROUND( (a.total_amount / NULLIF(ct.committee_total,0)) * 100, 2 ) AS pct,
    ROW_NUMBER() OVER (PARTITION BY a.acct_num ORDER BY a.total_amount DESC) AS rn
  FROM agg a
  JOIN comm_tot ct USING (acct_num)
)
INSERT INTO committee_top_vendors
  (acct_num, vendor_name, vendor_name_normalized, vendor_canonical_slug,
   total_amount, num_payments, pct)
SELECT
  acct_num,
  vendor_name,
  vendor_canonical_slug      AS vendor_name_normalized,
  vendor_canonical_slug,
  total_amount,
  num_payments,
  pct
FROM ranked
WHERE rn <= 20;
