# FL Donor Tracker — Research Knowledge Base

Internal research layer. **Nothing here goes public without explicit human approval.**

## Structure

```
research/
├── entities/    One JSON file per tracked entity (keyed by network graph node ID)
├── themes/      Narrative markdown per money thread
└── README.md    This file
```

## Approval Gate

- `approved_for_public: false` (default) — internal only
- `approved_for_public: true` on an entity → full summary + key_facts exposed
- `approved_for_public: true` on an individual article → that link surfaces on the site

Run `python scripts/24_export_research.py` to push approved content to `public/data/research/annotations.json`.

## Entity File Naming

Matches network graph node IDs exactly:
- `c_{acct_num}.json` for committees (e.g. `c_4700.json` = RPOF)
- `d_{SLUG}.json` for donors (e.g. `d_FLORIDA_POWER_LIGHT_COMPANY.json`)

## Research Index

| Entity | File | Themes | Status |
|---|---|---|---|
| Florida Power & Light | `entities/d_FLORIDA_POWER_LIGHT_COMPANY.json` | utilities, ghost-candidates, PSC | draft |
| NextEra Energy | `entities/d_NEXTERA_ENERGY_INC_.json` | utilities | pending |
| Trulieve Inc. | `entities/d_TRULIEVE_INC_.json` | cannabis, ballot-initiative | draft |
| Friends of Ron DeSantis | `entities/d_FRIENDS_OF_RON_DESANTIS.json` | desantis-network, pay-to-play | draft |
| Republican Party of Florida | `entities/c_4700.json` | republican-machine, dark-money | draft |
| Las Vegas Sands | `entities/d_LAS_VEGAS_SANDS_CO_.json` | gaming, ballot-initiative | draft |
| GEO Group | `entities/d_THE_GEO_GROUP_INC_.json` | private-prisons, immigration | draft |
| US Sugar Corporation | `entities/d_UNITED_STATES_SUGAR_CORPORATION.json` | sugar | pending |
| Publix Super Markets | `entities/d_PUBLIX_SUPER_MARKETS_INC_.json` | real-estate | pending |
| Florida Justice PAC | `entities/c_florida_justice_pac.json` | trial-lawyers | pending |
| Realtors PAC | `entities/c_realtors_pac.json` | real-estate | pending |

## Sources

- Jason Garcia / Seeking Rents substack — best investigative source on FL corporate money
- Tampa Bay Times investigative archive — FPL, sugar, prisons
- Miami Herald / McClatchy — DeSantis network, gaming
- Florida Phoenix (floridaphoenix.com) — state government accountability
- The Tributary — environment, water, sugar
- FloridaPolitics.com — day-to-day political coverage
- OpenSecrets.org — federal crossover donors
- FollowTheMoney.org — state-level cross-reference
- Politico Florida Playbook — insider/lobbying context
