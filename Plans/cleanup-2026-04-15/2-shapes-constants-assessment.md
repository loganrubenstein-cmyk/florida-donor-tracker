# Subagent 2: Shapes / Constants Consolidation — Assessment

## Summary
- Magic-string families found: 7 (link types, donor/entity types, confidence tiers, org types, shadow-org stub types, match methods, party/office codes)
- Record shapes to codify: 6 (Donor, Candidate, Committee, Lobbyist, Principal, Legislative Committee)
- Proposed new files: `lib/constants.js` (extend), `lib/shapes.js` (new, JSDoc typedefs)

## Magic Strings — HIGH confidence extract

### 1. LINK_TYPES
Values: `SOLICITATION_CONTROL`, `DIRECT_CONTRIBUTION_TO_CANDIDATE`, `IEC_FOR_OR_AGAINST`, `ECC_FOR_OR_AGAINST`, `STATEMENT_OF_ORG_SUPPORT`, `OTHER_DISTRIBUTION_TO_CANDIDATE`, `ADMIN_OVERLAP_ONLY`, `solicitation_stub`, `historical_stub`, `chair`, `treasurer` (legacy).
Occurrences: `lib/loadCandidate.js:62,110`, `components/candidate/CandidateProfile.js:20-40` (full enum + labels), `:158-159` (filters), `app/api/timeline/route.js`, `app/api/decode/route.js`, `components/committee/CommitteeProfile.js:267`.
Proposal: `LINK_TYPES` + `LINK_TYPE_LABELS` in `lib/constants.js`; move 40-line label map out of CandidateProfile.js.

### 2. DONOR_TYPES (is_corporate vs display label)
UI variants: `'Individual'`, `'Corporate'`, `'Corporate/Org'`, `'Committee/PAC'`.
Occurrences: `components/donors/DonorProfile.js:152`, `DonorsList.js:28,113`, `components/tools/DistrictLookup.js:11`, `DonorOverlap.js:9`, `DarkMoneyScoreboard.js:133,135`, `CandidateProfile.js:245`.
Proposal: `DONOR_TYPES` + label map; canonicalize the mixed spellings.

### 3. Party codes — already consolidated
`lib/partyUtils.js:4-22` owns PARTY_OVERRIDES + R_KW/D_KW keyword matching. Status: ✓ canonical; leave in place.

### 4. CONFIDENCE_TIERS
Values: `direct`, `normalized`, `inferred`, `classified`, `possible`.
Default fallback in `lib/loadCandidate.js:111` → `'possible'`. Need empirical consumer grep.
Proposal: `CONFIDENCE_TIERS` in constants.

### 5. ORG_TYPES (committee classification)
Raw FL values prefixed `'Type: '`; UI strips prefix in `components/committee/CommitteeProfile.js:154-158` and `SolicitationsList.js:203-205`.
Proposal: catalog real values, export as `ORG_TYPES` + stripper helper.

### 6. SHADOW_ORG_STUB_TYPES
Values: `'527'`, `'501c4'`, `'unknown'`.
Occurrences: `lib/loadCandidate.js:81,158`, `components/candidate/CandidateProfile.js:421-425` (color switching).
Proposal: `SHADOW_ORG_STUB_TYPES` constant.

### 7. Match method
Values (inferred from DB field): `'name_similarity'`, `'fuzzy_match'`, etc.
Occurrences: `lib/loadDonor.js:99,120`, `lib/loadCandidate.js:81,165`, `lib/loadLobbyist.js:154`, `app/api/contracts/route.js:48`.
Used for audit UI only. MEDIUM — catalog but may not need a strict enum.

## Record shapes — codify as JSDoc typedefs in `lib/shapes.js`

| Entity | Source of truth | Key fields (summary) |
|---|---|---|
| **DonorRecord** | `lib/loadDonor.js:132-147` | slug, name, is_corporate, total_{soft,hard,combined}, num_contributions, top_occupation, top_location, num_{committees,candidates}, has_lobbyist_link, industry; arrays: committees, candidates, by_year, lobbyist_principals, state_contracts, news |
| **CandidateRecord** | `lib/loadCandidate.js:133-188` | acct_num, candidate_name, election_id/year, office_code/desc, party_code, district, status_desc, total_combined, soft_money_total; nested: hard_money{...}, linked_pcs[], shadow_orgs[], expenditures{}, news[] |
| **CommitteeRecord** | `lib/loadCommittee.js:10-127` | acct_num, committee_name, total_received, num_contributions, date_range{earliest,latest}; nested: top_donors[], solicitation_id, org_type, solicitors[], website_url, committee_meta{}, shared_with{}, by_year[], expenditures{}, news[] |
| **LobbyistRecord** | `lib/loadLobbyist.js:6-45` | slug, name, firm, city, state, num_principals, num_active, total_donation_influence, has_donation_match, top_principal, total_comp; arrays: principals, compHistory |
| **PrincipalRecord** | `lib/loadLobbyist.js:55+` | slug, name, naics, city, state, total_lobbyists, num_active, donation_total, num_contributions, industry; arrays: lobbyists, donation_matches, comp_history, top_firms |
| **LegislativeCommitteeRecord** | `lib/loadLegislativeCommittee.js:3-80` | abbreviation, name, chamber, url, scraped_at, members[], totalRaised, partyBreak{}, topDonors[], industryBreakdown[] |

## Warnings for implementation

1. **Case inconsistency:** link_type uses UPPER_SNAKE_CASE (`SOLICITATION_CONTROL`) in schema but lowercase-with-underscore (`solicitation_stub`) in legacy fields. Both must stay — the constants mirror the DB values, do NOT silently canonicalize.
2. **Donor-label fragmentation:** "Individual" vs "Corporate" vs "Corporate/Org" vs "Committee/PAC" — coordinate label normalization with UI before collapsing.
3. **ORG_TYPES + match_method:** values catalog may be empirical — document what is currently observed; do not invent values.

## Implementation order
1. Create `lib/constants.js` with `LINK_TYPES`, `LINK_TYPE_LABELS`, `CONFIDENCE_TIERS`, `DONOR_TYPES`, `SHADOW_ORG_STUB_TYPES`.
2. Update top consumers: `components/candidate/CandidateProfile.js` (move 40-line label map), `lib/loadCandidate.js`, `components/donors/DonorProfile.js`, `components/donors/DonorsList.js`.
3. Create `lib/shapes.js` with 6 `@typedef` blocks (no runtime impact; pure reader aid).
4. Touch `ORG_TYPES` only after cataloging actual DB values; flag for user confirmation.

## Skip / leave alone
- `lib/partyUtils.js` (already canonical)
- `lib/officeCodes.js` (already organized)
- Python scripts — no obvious cross-file shape repetition worth consolidating; pipeline benefits from explicit per-script schemas.
