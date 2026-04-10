-- Add FK constraints for legislature tables so PostgREST joins work

ALTER TABLE committee_memberships
  ADD CONSTRAINT fk_cm_people_id
  FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;

ALTER TABLE committee_memberships
  ADD CONSTRAINT fk_cm_abbreviation
  FOREIGN KEY (abbreviation) REFERENCES legislative_committees(abbreviation) ON DELETE CASCADE;

ALTER TABLE legislator_votes
  ADD CONSTRAINT fk_lv_people_id
  FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;

ALTER TABLE bill_sponsorships
  ADD CONSTRAINT fk_bs_people_id
  FOREIGN KEY (people_id) REFERENCES legislators(people_id) ON DELETE CASCADE;
