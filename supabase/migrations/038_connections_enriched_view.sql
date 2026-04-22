-- Captures the connections_enriched view that already exists on the live DB but
-- was never committed as a migration. /connections and /api/connections both
-- depend on this view; without it they return an empty array.
--
-- Joins entity_connections to committee_meta twice (once per side) to resolve
-- treasurer/chair/address names and entity type_code for entity_a and entity_b.

CREATE OR REPLACE VIEW public.connections_enriched AS
SELECT
  ec.id,
  ec.entity_a,
  ec.entity_b,
  ec.entity_a_acct,
  ec.entity_b_acct,
  ec.connection_score,
  ec.shared_treasurer,
  ec.shared_address,
  ec.shared_phone,
  ec.shared_chair,
  ec.donor_overlap_pct,
  ec.money_between,
  ma.treasurer_name AS shared_treasurer_name,
  ma.chair_name     AS shared_chair_name,
  ma.address_line   AS shared_address_line,
  ma.type_code      AS entity_a_type,
  mb.type_code      AS entity_b_type
FROM entity_connections ec
LEFT JOIN committee_meta ma ON ma.acct_num = ec.entity_a_acct
LEFT JOIN committee_meta mb ON mb.acct_num = ec.entity_b_acct;

NOTIFY pgrst, 'reload schema';
