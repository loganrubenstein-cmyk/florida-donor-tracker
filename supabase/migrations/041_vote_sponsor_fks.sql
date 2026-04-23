-- Completes the original intent of migration 012: adds the people_id FKs on
-- legislator_votes and bill_sponsorships that were declared in 012 but never
-- applied to the live DB. (Committee_memberships FKs were already re-added
-- in 037.) Without these FKs, PostgREST embedded joins against the votes /
-- sponsorships tables fail with PGRST200.
--
-- Orphan audit 2026-04-23 vs legislators.people_id: 0 orphans on each table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_lv_people_id' AND conrelid = 'legislator_votes'::regclass
  ) THEN
    ALTER TABLE legislator_votes
      ADD CONSTRAINT fk_lv_people_id
      FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_bs_people_id' AND conrelid = 'bill_sponsorships'::regclass
  ) THEN
    ALTER TABLE bill_sponsorships
      ADD CONSTRAINT fk_bs_people_id
      FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
