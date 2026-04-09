-- donors
create index if not exists idx_donors_slug on donors(slug);
create index if not exists idx_donors_name on donors(name);
create index if not exists idx_donors_industry on donors(industry);
create index if not exists idx_donors_total_combined on donors(total_combined desc);
create index if not exists idx_donor_committees_slug on donor_committees(donor_slug);
create index if not exists idx_donor_candidates_slug on donor_candidates(donor_slug);
create index if not exists idx_donor_by_year_slug on donor_by_year(donor_slug);

-- candidates
create index if not exists idx_candidates_acct on candidates(acct_num);
create index if not exists idx_candidates_name on candidates(candidate_name);
create index if not exists idx_candidates_year on candidates(election_year);
create index if not exists idx_candidates_party on candidates(party_code);
create index if not exists idx_candidates_office on candidates(office_desc);
create index if not exists idx_candidate_quarterly_acct on candidate_quarterly(acct_num);
create index if not exists idx_candidate_top_donors_acct on candidate_top_donors(acct_num);
create index if not exists idx_candidate_top_donors_slug on candidate_top_donors(donor_slug);

-- committees
create index if not exists idx_committees_acct on committees(acct_num);
create index if not exists idx_committees_name on committees(committee_name);
create index if not exists idx_committee_top_donors_acct on committee_top_donors(acct_num);

-- lobbyists
create index if not exists idx_lobbyists_slug on lobbyists(slug);
create index if not exists idx_lobbyists_name on lobbyists(name);
create index if not exists idx_lobbyist_principals_slug on lobbyist_principals(lobbyist_slug);

-- principals
create index if not exists idx_principals_slug on principals(slug);
create index if not exists idx_principals_name on principals(name);
create index if not exists idx_principal_lobbyists_slug on principal_lobbyists(principal_slug);
create index if not exists idx_principal_donation_matches_slug on principal_donation_matches(principal_slug);

-- industries
create index if not exists idx_industry_by_committee_acct on industry_by_committee(acct_num);
create index if not exists idx_industry_trends_year on industry_trends(year);

-- analysis
create index if not exists idx_connections_score on entity_connections(connection_score desc);
create index if not exists idx_pc_links_candidate on candidate_pc_links(candidate_acct_num);
create index if not exists idx_cycle_donors_year on cycle_donors(year);
create index if not exists idx_cycle_donors_slug on cycle_donors(slug);
