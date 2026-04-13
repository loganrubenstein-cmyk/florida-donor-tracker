-- Migration 013: Add unique constraints to donor link tables
-- Prevents ON CONFLICT failures in backfill scripts (e.g. script 83, 85)
-- and enables clean ON CONFLICT DO UPDATE syntax going forward.

ALTER TABLE donor_committees
  ADD CONSTRAINT uq_donor_committees_slug_acct UNIQUE (donor_slug, acct_num);

ALTER TABLE donor_by_year
  ADD CONSTRAINT uq_donor_by_year_slug_year UNIQUE (donor_slug, year);
