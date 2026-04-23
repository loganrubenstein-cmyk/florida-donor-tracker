-- Extends fl_bill_number_to_slug to cover every FL bill prefix seen in the
-- data, not just HB/SB. bill_disclosures includes HJR, SJR, HM, SR, HR, SM,
-- HCR, SCR, SPB. Legislator_votes + bill_sponsorships only contain H-prefix
-- numbers today (House-only LegiScan feed), but the fn should be robust.

CREATE OR REPLACE FUNCTION public.fl_bill_number_to_slug(bn text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN bn IS NULL OR bn = '' THEN NULL
    -- Multi-letter prefix forms: HJR0001, SCR0012, HCR0034, HM0101, SM0102, SPB0007, SPBR...
    WHEN bn ~ '^[A-Za-z]{2,4}0*[1-9][0-9]*$' THEN
      lower(regexp_replace(bn, '^([A-Za-z]+)0*([0-9]+)$', '\1-\2'))
    -- Single-letter: H1019 / S0002 -> hb-1019 / sb-2
    WHEN bn ~ '^[HhSs]0*[1-9][0-9]*$' THEN
      (CASE WHEN upper(substring(bn FROM 1 FOR 1)) = 'H' THEN 'hb' ELSE 'sb' END)
      || '-' || (regexp_replace(substring(bn FROM 2), '^0+', ''))
    ELSE NULL
  END;
$$;

NOTIFY pgrst, 'reload schema';
