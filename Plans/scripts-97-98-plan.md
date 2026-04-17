# Scripts 97 + 98 — Execution Plan

## Script 97 — Sunbiz SFTP Bulk Download

### What it does
Downloads the FL Division of Corporations quarterly full extract (~400–600 MB zip) over SFTP,
parses the 1440-char fixed-width ASCII format (~2M+ records), and matches against our
donors/principals to enrich profiles with corporate structure (EIN, officers, registered agent).

### New dependencies
```
pip install paramiko>=3.4.0
```
(Already in `.pipeline-venv` requirements? If not: `source .pipeline-venv/bin/activate && pip install paramiko`)

### Pre-flight checks
1. **Disk space** — full extract is 400–600 MB compressed, ~2 GB unzipped. Check:
   ```
   df -h .
   ```
   Need ≥3 GB free before starting.

2. **SFTP connectivity test** — confirm access before triggering full download:
   ```
   source .pipeline-venv/bin/activate
   python3 -c "
   import paramiko
   t = paramiko.Transport(('sftp.floridados.gov', 22))
   t.connect(username='Public', password='PubAccess1845!')
   sftp = paramiko.SFTPClient.from_transport(t)
   print(sftp.listdir('/'))
   sftp.close(); t.close()
   "
   ```
   Expected: list of directories like `Apr`, `Jan`, `Jul`, `Oct` + daily delta folders.

### Dry run
```
source .pipeline-venv/bin/activate
python3 scripts/97_import_sunbiz_corporations.py --dry-run
```
Parses + matches without writing to DB. Verify:
- Record count printed (~1.5–2.5M active FL corps)
- Match rate against principals/donors (expect 5–20% match on name)
- No parse errors on first 10,000 records

### Full run
```
source .pipeline-venv/bin/activate
python3 scripts/97_import_sunbiz_corporations.py
```
Downloads Apr quarterly extract (most recent), parses all records, upserts to `fl_corporations`.
Expected duration: 15–30 min (download + parse).

### Verify
```
select count(*), count(ein) filter (where ein is not null) from fl_corporations;
select * from fl_corporations where corp_name ilike '%florida power%' limit 5;
```
Check `fl_corporations` row count, EIN coverage, and a known entity (FPL should appear).

### Frontend wiring needed after
- Donor profile: add corporate registration card if donor slug matches a corp record
  (corp number, EIN, officers, status, filing date)
- Principal profile: same — principals are mostly FL-registered corps
- New `/corporations` directory page (optional — could be search-only)

---

## Script 98 — FL Ethics Financial Disclosures

### What it does
Scrapes `disclosure.floridaethics.gov` for Form 1 (legislators) and Form 6 (constitutional
officers) financial disclosures. Downloads PDFs, parses income sources, real estate,
business interests, liabilities. ~300 officials total.

### Complexity: HIGH
- Requires Playwright + Chromium (browser automation — site rejects bare HTTP requests)
- PDF layouts vary by year — parsers are scaffolded/skeleton, need calibration on real PDFs
- **Recommended approach:** run in two phases, verify PDF text before trusting parsed output

### New dependencies
```
source .pipeline-venv/bin/activate
pip install playwright pdfplumber
playwright install chromium
```
Chromium download is ~150 MB. Install once.

### Phase 1 — Scrape + download PDFs (browser required)
```
source .pipeline-venv/bin/activate
python3 scripts/98_scrape_ethics_disclosures.py
```
This:
1. Opens headless Chromium → navigates to disclosure.floridaethics.gov
2. Searches each of ~160 legislators by name
3. Downloads most recent Form 1 or Form 6 PDF per official
4. Caches: `data/raw/ethics/search_results.json` + `data/raw/ethics/pdfs/*.pdf`
5. Writes raw PDF text dumps to `data/raw/ethics/pdf_text_debug/` for parser dev

**Test single official first:**
```
python3 scripts/98_scrape_ethics_disclosures.py --legislator "Anderson, Adam"
```
Verify PDF lands in `data/raw/ethics/pdfs/` and text dump in `pdf_text_debug/`.

### Phase 2 — Calibrate PDF parsers (MANUAL STEP)
The PDF field extraction is scaffolded — income section, real estate section, etc. are
identified by text anchors that vary by year. Before running parse on all 300 PDFs:

1. Open 2–3 PDFs from `pdf_text_debug/` (pick a 2023, 2022, 2021 filing)
2. Identify the exact text anchors for each section (e.g., "PART A — PRIMARY SOURCES OF INCOME")
3. Update `parse_form1_pdf()` / `parse_form6_pdf()` in script 98 to match those anchors
4. Re-run `--parse-only` to validate extraction

```
python3 scripts/98_scrape_ethics_disclosures.py --parse-only
```

### Phase 3 — Load to Supabase
```
python3 scripts/98_scrape_ethics_disclosures.py --load-only
```
Upserts to `official_disclosures` table. Verify 1–2 known officials in Supabase.

### Frontend wiring needed after
- Legislator profile: "Financial Disclosure" section showing income sources + interests
  (only if the legislator's disclosure was found and parsed)
- Link to source PDF on floridaethics.gov
- Note: income data is self-reported; add appropriate caveat in UI

### Risks
| Risk | Mitigation |
|---|---|
| Site structure changed | Run single test first; inspect HTML before full scrape |
| PDF text extraction fails (image-based PDFs) | Flag affected records; offer raw PDF link in UI |
| Parser field anchors wrong | Use `--parse-only` iteratively after fixing anchors |
| 300 PDFs = ~50 MB | Manageable; keep in `data/raw/ethics/pdfs/` |

---

## Run Order Summary

```
# 97
pip install paramiko
python3 scripts/97_import_sunbiz_corporations.py --dry-run   # verify
python3 scripts/97_import_sunbiz_corporations.py             # full run

# 98 (after 97 succeeds)
pip install playwright pdfplumber && playwright install chromium
python3 scripts/98_scrape_ethics_disclosures.py --legislator "Anderson, Adam"  # test
# → manually check pdf_text_debug/ output, calibrate parsers
python3 scripts/98_scrape_ethics_disclosures.py              # full scrape
python3 scripts/98_scrape_ethics_disclosures.py --parse-only # parse PDFs
python3 scripts/98_scrape_ethics_disclosures.py --load-only  # push to Supabase
```
