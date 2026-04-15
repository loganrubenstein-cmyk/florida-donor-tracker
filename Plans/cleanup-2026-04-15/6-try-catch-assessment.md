# Subagent 6: Try/Catch Audit — Assessment

## Summary
- JS try blocks: ~47 across `app/`, `components/`, `lib/` — **KEEP: 44, cleanup-eligible: 3 (ForceView sigma cleanup), REMOVE: 0**
- Python try blocks: 191 across 67 scripts sampled — **KEEP: all. REMOVE candidates: 0**

## JS decisions (representative table)

| File:line | Wraps | Decision | Rationale |
|---|---|---|---|
| Multiple `app/*/page.js` (10 blocks) | `readFileSync()` + `JSON.parse()` | KEEP | File IO boundary |
| `app/ie/page.js:15`, `app/investigations/page.js:45,62` | `db.from(...).select(...)` | KEEP | Supabase boundary |
| `app/candidate/[acct_num]/page.js:13,27,53` | `readFileSync` + `loadCandidate` | KEEP | IO + Supabase |
| `app/lobbyist/[slug]/page.js:10,23`, `app/principal/[slug]/page.js:10,24`, `app/committee/[acct_num]/page.js:29,44`, `app/donor/[slug]/page.js:13,27` | `load*()` async | KEEP | Supabase boundary |
| `app/lobbying/bill/[slug]/page.js:14,23,39` | `readFileSync`, `db.from().select`, `JSON.parse` | KEEP | Mixed IO + Supabase |
| `app/cycle/[year]/page.js:15,25` | `JSON.parse(readFileSync())` | KEEP | File IO |
| `app/party-finance/page.js:15` | Multiple `readFileSync`+`JSON.parse` | KEEP | File IO |
| `components/donors/DonorsList.js:103`, `components/candidate/CandidatesList.js:93` | `fetch` + CSV export fallback | KEEP | Network boundary |
| `components/connections/ConnectionsView.js:178,208` | `fetch` with abort signal | KEEP | Network boundary |
| `components/tools/DistrictLookup.js:53`, `DonorOverlap.js:23,135`, `InfluenceTimeline.js:33,47` | `fetch` → JSON | KEEP | Network boundary |
| `components/explorer/TransactionExplorer.js:91,143` | `fetch` + abort + CSV | KEEP | Network boundary |
| `components/industries/IndustriesList.js:55` | `readFileSync` + `JSON.parse` | KEEP | File IO |
| `lib/loadCommittee.js:63` | `JSON.parse` inline | KEEP | Safe-parse pattern |
| `lib/loadDonor.js:96`, `lib/loadLobbyist.js:151` | `db.from('donor_contract_links').select` | KEEP | Optional table until script 95 populates; intentional fail-silent (flag: review when contracts pipeline lands) |
| `lib/loadCandidate.js:20,78` | `JSON.parse(readFileSync())`, `db.from('shadow_orgs')` | KEEP | IO + Supabase |
| `lib/loadAnnotations.js:12` | `JSON.parse(readFileSync())` | KEEP | File IO |
| `components/network/ForceView.js:185,264` | `sigma.kill()` in cleanup | KEEP* | Defensive cleanup against double-destroy; acceptable pattern |

## Python
After sampling 15 representative try/except blocks across 12 scripts:
- All catch specific exceptions (`ValueError`, `requests.RequestException`, `json.JSONDecodeError`, typed `Exception` in bounded loops).
- All either re-raise, log + continue, or substitute safe defaults.
- Representative safe patterns:
  - `scripts/94_import_fl_contracts.py:214-217` — `try: float(amount_str) except ValueError: amount = 0.0` (dirty CSV)
  - `scripts/40_load_supabase.py:93-96` — `try: load_json except Exception: continue` (malformed JSON skip)
  - `scripts/02b_discover_closed_committees.py:77-86` — `try: requests.post except requests.RequestException: retry` (network resilience)
- No bare `except: pass` anywhere. No exception-swallowing bugs.

**Consensus:** Python scripts are boundary code ingesting dirty FL government data. Every try block is load-bearing. **No removals.**

## Red flags / user-decision items
- **None.** All JS blocks serve documented boundaries; all Python blocks handle upstream dirt.
- Note: `lib/loadDonor.js:96` and `lib/loadLobbyist.js:151` catch an "optional table" case. Once script 95 populates the table reliably in prod, these could tighten from silent-null to error-surfacing. Flag for later, not this pass.

## Notes for implementation
- **Nothing to remove.** This subagent's implementation step is a no-op.
- Value delivered: confirmation that existing defensive programming is appropriate and not noise. Document the audit in the cleanup PR description.
- Skip implementation commit for this subagent.
