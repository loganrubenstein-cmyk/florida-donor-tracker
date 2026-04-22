-- Re-adds FKs from migration 012 that were never applied to the live DB.
-- Without these, PostgREST embedded joins (committee_memberships -> legislators)
-- fail with PGRST200 and /legislature/committees renders "0 members".
-- Scoped to committee_memberships only; legislator_votes + bill_sponsorships FKs
-- from 012 remain outstanding but are T1 territory this session.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_cm_people_id' AND conrelid = 'committee_memberships'::regclass
  ) THEN
    ALTER TABLE committee_memberships
      ADD CONSTRAINT fk_cm_people_id
      FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_cm_abbreviation' AND conrelid = 'committee_memberships'::regclass
  ) THEN
    ALTER TABLE committee_memberships
      ADD CONSTRAINT fk_cm_abbreviation
      FOREIGN KEY (abbreviation) REFERENCES legislative_committees(abbreviation) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
