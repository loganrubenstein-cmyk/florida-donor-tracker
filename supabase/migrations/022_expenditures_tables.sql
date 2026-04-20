-- Migration 022: Row-level expenditures tables
-- Until now, expenditure data only existed as summary aggregates in Supabase
-- (committee_expenditure_summary, candidate_expenditure_summary). Row-level
-- data lived in gitignored public/data/expenditures/ JSON.
-- This migration brings row-level expenditures into Supabase so profile pages
-- can query "who did X pay?" via Supabase instead of static JSON.

CREATE TABLE IF NOT EXISTS expenditures (
  id                    bigserial PRIMARY KEY,
  acct_num              text NOT NULL,
  report_year           smallint,
  report_type           text,
  expenditure_date      date,
  amount                numeric(14,2),
  vendor_name           text,
  vendor_address        text,
  vendor_city_state_zip text,
  purpose               text,
  type_code             text,
  source_file           text,
  retrieved_at          timestamptz DEFAULT now(),
  UNIQUE (acct_num, expenditure_date, amount, vendor_name, purpose, report_year, report_type)
);

CREATE INDEX IF NOT EXISTS expenditures_acct_idx
  ON expenditures (acct_num);
CREATE INDEX IF NOT EXISTS expenditures_date_idx
  ON expenditures (expenditure_date);
CREATE INDEX IF NOT EXISTS expenditures_vendor_trgm
  ON expenditures USING gin (vendor_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS candidate_expenditures (
  id                    bigserial PRIMARY KEY,
  acct_num              text NOT NULL,
  candidate_id          bigint REFERENCES candidates(id) ON DELETE SET NULL,
  report_year           smallint,
  report_type           text,
  expenditure_date      date,
  amount                numeric(14,2),
  vendor_name           text,
  vendor_address        text,
  vendor_city_state_zip text,
  purpose               text,
  type_code             text,
  source_file           text,
  retrieved_at          timestamptz DEFAULT now(),
  UNIQUE (acct_num, expenditure_date, amount, vendor_name, purpose, report_year, report_type)
);

CREATE INDEX IF NOT EXISTS cand_exp_acct_idx
  ON candidate_expenditures (acct_num);
CREATE INDEX IF NOT EXISTS cand_exp_cand_idx
  ON candidate_expenditures (candidate_id);
CREATE INDEX IF NOT EXISTS cand_exp_date_idx
  ON candidate_expenditures (expenditure_date);
CREATE INDEX IF NOT EXISTS cand_exp_vendor_trgm
  ON candidate_expenditures USING gin (vendor_name gin_trgm_ops);
