-- Adds canonical bill_slug column to legislator_votes and bill_sponsorships so
-- callers can join on the same key bill_info and bill_disclosures already use.
-- Previously lib/loadBill.js had to convert bill_slug -> zero-padded bill_number
-- (H1019) at query time. This lets downstream code join directly on bill_slug.
--
-- Includes a small helper fl_bill_number_to_slug(text) mirroring the JS
-- billNumberToSlug() in lib/fmt.js, so pipeline scripts can backfill
-- consistently (e.g. 'H1019' -> 'hb-1019', 'S0002' -> 'sb-2').

CREATE OR REPLACE FUNCTION public.fl_bill_number_to_slug(bn text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN bn IS NULL OR bn = '' THEN NULL
    WHEN bn ~ '^[HS]0*[0-9]+$' THEN
      (CASE WHEN upper(substring(bn FROM 1 FOR 1)) = 'H' THEN 'hb' ELSE 'sb' END)
      || '-' || (regexp_replace(substring(bn FROM 2), '^0+', ''))
    ELSE NULL
  END;
$$;

ALTER TABLE legislator_votes   ADD COLUMN IF NOT EXISTS bill_slug text;
ALTER TABLE bill_sponsorships  ADD COLUMN IF NOT EXISTS bill_slug text;

UPDATE legislator_votes
   SET bill_slug = fl_bill_number_to_slug(bill_number)
 WHERE bill_slug IS NULL AND bill_number IS NOT NULL;

UPDATE bill_sponsorships
   SET bill_slug = fl_bill_number_to_slug(bill_number)
 WHERE bill_slug IS NULL AND bill_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS lv_bill_slug_idx ON legislator_votes (bill_slug);
CREATE INDEX IF NOT EXISTS bs_bill_slug_idx ON bill_sponsorships (bill_slug);

NOTIFY pgrst, 'reload schema';
