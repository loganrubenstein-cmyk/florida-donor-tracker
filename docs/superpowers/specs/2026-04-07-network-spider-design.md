# Network Spider — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

---

## Context

The pipeline already downloads FL Division of Elections contribution data for a single committee (RPOF). Analyzing that data revealed that several top "donors" are themselves political committees and PACs — e.g. Friends of Ron DeSantis gave $115M to RPOF. The goal of this feature is to recursively follow those money flows: for every entity that donated to a known committee, download *their* contribution records, find *their* donors, and repeat — building a full spider web of political influence. The result is served as a pre-computed JSON graph and visualized as an interactive satellite network on a `/network` page.

---

## What We're Building

Two things:

1. **`scripts/10_spider_graph.py`** — a new Python pipeline script that recursively discovers which donors are themselves registered FL committees, downloads their contribution data, and exports `public/data/network_graph.json`.

2. **`app/network/page.js`** — a Next.js page with a force-directed satellite graph (switchable to Sankey and Radial), a persistent right-side detail panel, and a search box. Deep-linkable from anywhere on the site.

---

## Pipeline: `scripts/10_spider_graph.py`

### Algorithm

1. **Load** `data/processed/contributions_deduped.csv` (falls back to `contributions.csv`) and `data/processed/committees.csv`.
2. **Build name lookup** — normalize every committee name using the existing `clean_name()` from `09_deduplicate_donors.py` → `{cleaned_name: acct_num}`.
3. **Seed queue** with the committees already scraped (derived from `source_file` values in contributions CSV — currently just RPOF/4700). Track a `visited` set to prevent cycles.
4. **For each committee in the queue:**
   - Compute top-25 donors by total amount from the contributions data.
   - For each donor name, run `clean_name()` and check against the lookup.
   - If a match is found and the committee hasn't been visited → add to queue.
   - Attempt to download `Contrib_{acct}.txt` from the FL DOE CGI (same pattern as `03_scrape_contributions.py`). If the CGI is down or returns an error → mark node `data_pending: true` and continue (no crash).
   - If download succeeds → parse with the same logic as `01_import_finance.py` and append to the in-memory contributions DataFrame.
5. **Repeat** until the queue is empty.
6. **Build graph** and export `public/data/network_graph.json`.

### Graph JSON Schema

```json
{
  "nodes": [
    {
      "id": "c_4700",
      "label": "Republican Party of Florida",
      "type": "committee",
      "acct_num": "4700",
      "total_received": 234567890.0,
      "total_given": 0.0,
      "num_contributions_in": 166890,
      "depth": 0,
      "data_pending": false
    },
    {
      "id": "c_12345",
      "label": "FRIENDS OF RON DESANTIS",
      "type": "committee",
      "acct_num": "12345",
      "total_received": 42000000.0,
      "total_given": 115097993.2,
      "num_contributions_in": 312,
      "depth": 1,
      "data_pending": false
    },
    {
      "id": "d_FLORIDA_POWER_LIGHT",
      "label": "FLORIDA POWER & LIGHT COMPANY",
      "type": "corporate",
      "acct_num": null,
      "total_given": 67925322.57,
      "depth": 1,
      "data_pending": false
    }
  ],
  "edges": [
    {
      "source": "c_12345",
      "target": "c_4700",
      "total_amount": 115097993.2,
      "num_contributions": 98
    }
  ],
  "meta": {
    "generated_at": "2026-04-07T13:00:00Z",
    "committees_spidered": ["4700", "12345"],
    "total_nodes": 520,
    "total_edges": 847,
    "max_depth": 3
  }
}
```

**Node types:** `"committee"` (matched to committees.csv), `"corporate"` (`is_corporate()` = true), `"individual"`.  
**Node size** in visualization: log-scaled to `total_given`.  
**`data_pending: true`** = CGI was down when attempted — shown as a dimmed node with a `?` indicator and dashed connection.

### Key implementation details

- Reuse `clean_name()` from `09_deduplicate_donors.py` for name matching. Since filenames start with digits, use `importlib.util.spec_from_file_location` — the same pattern used in the test files.
- Reuse `is_corporate()` from `08_export_json.py` for node type classification.
- Use the same HTTP retry/delay config (`REQUEST_DELAY_SEC`, `MAX_RETRIES`, `REQUEST_TIMEOUT`) from `config.py`.
- Only the top-25 donors per committee are included in the graph edges (consistent with the top-N display decision). The `"+ N more"` count is stored on each node so the frontend can show it.
- Add `10_spider_graph.py` to the `STEPS` list in `06_orchestrate.py` after `08_export_json.py`.

### Tests (`tests/test_10_spider_graph.py`)

- Name matching: `clean_name("FRIENDS OF RON DESANTIS")` matches committee record.
- Cycle detection: visiting the same acct_num twice does not cause infinite loop.
- CGI failure: when download returns error, node is marked `data_pending: true`, script exits 0.
- Graph structure: output JSON has required `nodes`, `edges`, `meta` keys.

---

## Frontend: `app/network/page.js`

### Page structure

```
[Nav bar]
[Search box] [Force | Sankey | Radial switcher] [node/edge count pill]
[Graph canvas — ~70% width] | [Detail panel — ~30% width]
```

### Visual design — "satellites in the night sky"

- **Background:** near-black `#01010d` with a scattered star field (static SVG dots at varying opacity/size).
- **Nodes:** small crisp bright dots with a multi-layer soft glow halo (no cross/spike lines). Core is white; halo color identifies type:
  - `#ffb060` + orange halo → committee recipient (RPOF-style)
  - `#4dd8f0` + teal halo → committee/PAC donor
  - `#a0c0ff` + blue halo → political party
  - `#80ffa0` + green halo → corporate/individual donor
  - Dimmed with `?` → `data_pending`
- **Node size:** log-scaled to `total_given`. Larger dot + wider halo = more money moved.
- **Selected node:** extra-wide halo + slowly rotating dashed gold ring (CSS animation).
- **Edges:** thin bright core line + soft glow layer. Line width proportional to `total_amount`. Directional (money flows toward recipient). Dollar annotations on the largest edges.
- **Labels:** monospace `Courier New`, positioned beside nodes (not inside). Name + amount in a dimmer secondary color below.

### Visualization modes (toggled via switcher)

| Mode | Library | Notes |
|---|---|---|
| Force-directed | Sigma.js + Graphology | Default. Nodes repel, edges attract. Click-to-highlight. |
| Sankey | Recharts `<Sankey>` | Left-to-right flow. Shows scale of dollar amounts clearly. |
| Radial | Custom SVG layout | Selected entity at center, donors orbit in depth rings. |

All three modes read from the same `network_graph.json`. The active mode is reflected in the URL (`?viz=force|sankey|radial`).

### Detail panel (right side, persistent)

- **Default state:** "Click any node to explore" with a faint prompt.
- **On node click:** updates without moving or re-rooting the graph.
  - Entity name, type badge, acct number (if committee)
  - Two stat cells: total given / total received (monospace font)
  - "Funded by" list — top 25 donors with amounts, scrollable
  - Committee donors in the list are colored differently (teal) to signal they're also nodes in the graph
  - `"+ N more →"` link at the bottom
  - "Re-center graph here" button → re-roots the force layout on the clicked node
  - "View full profile →" → links to a future per-committee detail page

### URL / deep linking

| URL | Behavior |
|---|---|
| `/network` | Default view, highest-value node centered |
| `/network?acct=4700` | Graph centered on committee by acct_num |
| `/network?donor=FRIENDS+OF+RON+DESANTIS` | Centered on donor by canonical name |
| `/network?viz=sankey` | Opens directly in Sankey mode |

Deep links are generated automatically on the top donors list page (each donor name links to `/network?donor=...`).

### Data loading

`network_graph.json` is read at build time via `lib/loadNetworkGraph.js` (same static-JSON pattern used for other pages). No API calls at runtime.

---

## File Map

| Action | File |
|---|---|
| Create | `scripts/10_spider_graph.py` |
| Create | `tests/test_10_spider_graph.py` |
| Create | `app/network/page.js` |
| Create | `components/network/GraphCanvas.js` |
| Create | `components/network/DetailPanel.js` |
| Create | `components/network/VizSwitcher.js` |
| Create | `lib/loadNetworkGraph.js` |
| Modify | `scripts/06_orchestrate.py` — add step 10 |
| Modify | `scripts/requirements.txt` — no new deps needed |

---

## Verification

1. Run `python scripts/10_spider_graph.py` — check output prints nodes/edges count, `public/data/network_graph.json` exists and has correct schema.
2. Run `python -m pytest tests/test_10_spider_graph.py -v` — all tests pass.
3. Run `npm run dev`, open `http://localhost:3000/network` — graph renders, star field visible, nodes glow.
4. Click a node → detail panel updates, graph stays still.
5. Click "Re-center graph here" → graph re-roots.
6. Switch to Sankey and Radial modes → both render correctly.
7. Open `/network?acct=4700` → RPOF is the centered/highlighted node.
8. Verify cross-connections: if US Sugar appears in both RPOF and DeSantis contribution files, it has two edges in the graph.
9. Simulate CGI failure (empty `data/raw/contributions/` for a committee) → node renders as `data_pending` with `?`.
