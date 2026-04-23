-- DB-side aggregate RPCs for /expenditures hero stats so the JS sum doesn't
-- silently undercount when committee_expenditure_summary or
-- candidate_expenditure_summary exceeds a client-side row limit.

CREATE OR REPLACE FUNCTION public.get_committee_expenditure_global_totals()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'total_spent',     COALESCE(SUM(total_spent), 0)::numeric,
    'num_expenditures', COALESCE(SUM(num_expenditures), 0)::bigint,
    'num_rows',         COUNT(*)::bigint
  )
  FROM committee_expenditure_summary;
$$;

CREATE OR REPLACE FUNCTION public.get_candidate_expenditure_global_totals()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'total_spent',     COALESCE(SUM(total_spent), 0)::numeric,
    'num_expenditures', COALESCE(SUM(num_expenditures), 0)::bigint,
    'num_rows',         COUNT(*)::bigint
  )
  FROM candidate_expenditure_summary;
$$;

NOTIFY pgrst, 'reload schema';
