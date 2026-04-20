# FL Lobbyist Registration PDF Parser — Phased Plan

**Saved:** 2026-04-19
**Status:** Phase A in progress

## Why we're doing this

Comp TXT (scripts 47b/88) gives us firm↔lobbyist↔principal relationships and compensation ranges, but misses four data elements that the registration PDFs uniquely carry:

1. **NAICS industry codes per principal** — unlocks the deferred industry classifier feature (see `memory/industry_classifier_todo.md`).
2. **Lobbyist contact info** (phone + address) — comp TXT only has the lobbyist name.
3. **Registration effective dates** — per lobbyist↔principal pair.
4. **Chamber scope** — House / Senate / PSCNC specificity.
5. **Zero-comp relationships** — retainers and pro bono engagements that don't file comp reports.

Plus: registration PDFs update continuously, whereas comp TXT lags 45 days behind each quarter end.

## Data sources

Pattern: `https://floridalobbyist.gov/reports/{Lobbyist|Principl}_{LEG|EXE}_{YEAR}.pdf`

Confirmed live (2026-04-19):
- `Lobbyist_LEG_2026.pdf` — 546 pages, 2.4 MB, text-layout (no tables)
- `Principl_LEG_2026.pdf` — 685 KB
- Also: LEG/EXE × 2006–2026

## Phase A — Conditional-GET downloader (CHEAP, ~30 LOC)

**Goal:** stash PDFs locally with If-Modified-Since so we don't redownload unchanged files.

**Deliverable:** `scripts/14b_download_registration_pdfs.py`
- Downloads current-year Lobbyist_{LEG,EXE}.pdf + Principl_{LEG,EXE}.pdf (4 files)
- Uses the same `If-Modified-Since` + `os.utime(Last-Modified)` pattern as script 47b
- Writes to `data/raw/lobbyist_registrations/{YEAR}/{filename}.pdf`
- Writes sentinel `/tmp/registration_changed` when any file updates
- Safe to run daily; ~4 HEAD-equivalent 304 responses when nothing changed

**Exit criteria:** Local test shows 4 files downloaded first run, then 4×304 second run.

## Phase B — Minimal value-add parser (MEDIUM, ~150 LOC)

**Goal:** extract only the unique-to-PDF fields, skip what comp TXT already has.

**Deliverable:** `scripts/14c_parse_registration_pdfs.py`
- Uses pdfplumber with coordinate-aware extraction to handle the two-column layout
- Outputs tuples of `(lobbyist_name, lobbyist_phone, lobbyist_addr, principal_name, industry_code, effective_date, chamber_scope, branch, year)`
- Writes `data/processed/lobbyist_registrations.csv`

**Schema target (`lobbyist_registrations` table):**
```sql
CREATE TABLE lobbyist_registrations (
  id              bigserial PRIMARY KEY,
  year            smallint NOT NULL,
  branch          text NOT NULL,          -- 'legislative' | 'executive'
  lobbyist_name   text NOT NULL,
  lobbyist_phone  text,
  lobbyist_addr   text,
  principal_name  text NOT NULL,
  industry_code   text,                   -- NAICS 6-digit
  effective_date  date,
  chamber_scope   text[],                 -- subset of {House, Senate, PSCNC}
  source_url      text,
  retrieved_at    timestamptz DEFAULT now(),
  UNIQUE (year, branch, lobbyist_name, principal_name)
);
```

**Exit criteria:** Spot-check 10 random lobbyist entries against the PDF visually — all 5 fields correct.

## Phase C — Industry classifier integration (LATER, TBD)

**Goal:** join NAICS codes to existing industry system.

- Map NAICS 6-digit → existing 15-bucket classifier
- Either replace `industry_classifier_todo.md` occupation-string approach or augment it (NAICS from registration PDF for principals, occupation string for donors)
- Frontend: add chamber-scope filter to LobbyistProfile, industry chips to PrincipalProfile

## Workflow integration

- Add Phase A download step to `daily-fl-lobbyist.yml` (same workflow as comp refresh) — gate Phase B parsing + Supabase load on the `registration_changed` sentinel, identical to how comp changes already gate.
- Keep the comp pipeline independent — this is additive, not a replacement.

## Out of scope

- Parsing registration PDFs from pre-2020 years (historical backfill)
- Executive-branch-only lobbyist analytics (volume is tiny vs legislative)
- Lobbyist disciplinary / enforcement data (separate source: ethics.state.fl.us)
