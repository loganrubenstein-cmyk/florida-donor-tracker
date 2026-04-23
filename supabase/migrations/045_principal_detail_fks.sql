-- FKs on principal_donation_matches + principal_lobbyists -> principals(slug)
-- so PostgREST can resolve embedded `principals(name)` joins.
-- Without these, loadDonor.js's `.select('principal_slug, contributor_name,
-- match_score, principals(name)')` fails with PGRST200 and the donor profile
-- silently falls through to Fallback B (which often picks a different
-- principal than the exact contributor_name match that exists in the table).
--
-- Orphan audit 2026-04-23: 0 orphans on either table vs principals.slug.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pdm_principal_slug'
      AND conrelid = 'principal_donation_matches'::regclass
  ) THEN
    ALTER TABLE principal_donation_matches
      ADD CONSTRAINT fk_pdm_principal_slug
      FOREIGN KEY (principal_slug) REFERENCES principals(slug) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pl_principal_slug'
      AND conrelid = 'principal_lobbyists'::regclass
  ) THEN
    ALTER TABLE principal_lobbyists
      ADD CONSTRAINT fk_pl_principal_slug
      FOREIGN KEY (principal_slug) REFERENCES principals(slug) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
