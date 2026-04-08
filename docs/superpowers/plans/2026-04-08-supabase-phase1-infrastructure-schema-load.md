# Supabase Phase 1: Infrastructure, Schema & Data Load

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get all existing Florida Donor Tracker data loaded into a Supabase Postgres database, verified and ready for Phase 2 (API routes + frontend migration).

**Architecture:** Python loader script reads the existing processed JSON/CSV files in `public/data/` and `data/processed/`, then bulk-inserts them into 20 Postgres tables via a direct psycopg2 connection. SQL migration files define the schema and are committed to git. The Next.js app and public JSON files are NOT touched in this phase.

**Tech Stack:** Supabase (hosted Postgres), psycopg2-binary (Python bulk loader), @supabase/supabase-js (Next.js client, configured here for Phase 2 use), python-dotenv

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.env.local` | Create | Supabase credentials for Next.js + Python |
| `lib/supabase.js` | Create | Supabase JS client singleton |
| `supabase/migrations/001_donors.sql` | Create | donors, donor_committees, donor_candidates, donor_by_year tables |
| `supabase/migrations/002_candidates.sql` | Create | candidates, candidate_quarterly, candidate_top_donors tables |
| `supabase/migrations/003_committees.sql` | Create | committees, committee_top_donors tables |
| `supabase/migrations/004_lobbyists.sql` | Create | lobbyists, lobbyist_principals tables |
| `supabase/migrations/005_principals.sql` | Create | principals, principal_lobbyists, principal_donation_matches tables |
| `supabase/migrations/006_industries.sql` | Create | industry_buckets, industry_by_committee, industry_trends tables |
| `supabase/migrations/007_analysis.sql` | Create | entity_connections, candidate_pc_links, cycle_donors tables |
| `supabase/migrations/008_indexes.sql` | Create | All performance indexes |
| `scripts/40_load_supabase.py` | Create | Bulk-loads all tables from existing JSON/CSV files |

---

## Task 1: Gather Supabase Credentials

You do this in the browser — Claude cannot access your Supabase account.

- [ ] **Step 1: Get API keys**

  In Supabase dashboard → left sidebar → **Project Settings** → **API**

  Copy these three values:
  - **Project URL** — looks like `https://epljkcqdfvmfngsdijci.supabase.co`
  - **anon public** key — long string starting with `eyJ...`
  - **service_role** key — different long string starting with `eyJ...` (keep this secret)

- [ ] **Step 2: Get database password**

  In Supabase dashboard → **Project Settings** → **Database**

  Scroll to **Connection string** → select **URI** format. Copy the full string — it looks like:
  ```
  postgresql://postgres.epljkcqdfvmfngsdijci:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:6543/postgres
  ```

  > If you don't remember your password, click **Reset database password** on the same page. Pick something strong and save it.

- [ ] **Step 3: Create .env.local in the project root**

  Create the file `~/Claude Projects/florida-donor-tracker/.env.local` with this content, filling in your actual values:

  ```
  NEXT_PUBLIC_SUPABASE_URL=https://epljkcqdfvmfngsdijci.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
  SUPABASE_DB_URL=postgresql://postgres.epljkcqdfvmfngsdijci:YOUR-PASSWORD@aws-0-us-east-2.pooler.supabase.com:6543/postgres
  ```

  > `.env.local` is already in `.gitignore` — your keys will never be committed to git.

---

## Task 2: Install JavaScript Dependency + Create Supabase Client

- [ ] **Step 1: Install @supabase/supabase-js**

  Run in terminal from the project folder:
  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker && npm install @supabase/supabase-js
  ```

  Expected output: `added 1 package` (or similar)

- [ ] **Step 2: Create lib/supabase.js**

  Create `lib/supabase.js`:
  ```js
  import { createClient } from '@supabase/supabase-js';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  export const supabase = createClient(supabaseUrl, supabaseAnonKey);
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker
  git add lib/supabase.js package.json package-lock.json
  git commit -m "Add Supabase JS client"
  ```

---

## Task 3: Install Python Dependencies

- [ ] **Step 1: Install psycopg2-binary and python-dotenv**

  Run in terminal from the project folder:
  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker && pip install psycopg2-binary python-dotenv
  ```

  Expected: both packages install successfully.

- [ ] **Step 2: Verify connection works**

  Run this quick test (fill in your actual DB URL):
  ```bash
  python3 -c "
  import psycopg2, os
  from dotenv import load_dotenv
  load_dotenv('.env.local')
  conn = psycopg2.connect(os.getenv('SUPABASE_DB_URL'))
  print('Connected! Postgres version:', conn.server_version)
  conn.close()
  "
  ```

  Expected output: `Connected! Postgres version: 150...` (any 15.x version)

---

## Task 4: Write SQL Migration Files

Create the `supabase/migrations/` directory and all 8 migration files. These are committed to git for history — you'll run them via the Supabase SQL editor in Task 5.

- [ ] **Step 1: Create migrations directory**

  ```bash
  mkdir -p ~/Claude\ Projects/florida-donor-tracker/supabase/migrations
  ```

- [ ] **Step 2: Create 001_donors.sql**

  Create `supabase/migrations/001_donors.sql`:
  ```sql
  create table if not exists donors (
    id bigint generated always as identity primary key,
    slug text not null unique,
    name text not null,
    is_corporate boolean default false,
    total_soft numeric(15,2) default 0,
    total_hard numeric(15,2) default 0,
    total_combined numeric(15,2) default 0,
    num_contributions integer default 0,
    top_occupation text,
    top_location text,
    num_committees integer default 0,
    num_candidates integer default 0,
    has_lobbyist_link boolean default false,
    industry text,
    extra jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists donor_committees (
    id bigint generated always as identity primary key,
    donor_slug text not null,
    acct_num text not null,
    committee_name text,
    total numeric(15,2),
    num_contributions integer
  );

  create table if not exists donor_candidates (
    id bigint generated always as identity primary key,
    donor_slug text not null,
    acct_num text not null,
    candidate_name text,
    total numeric(15,2),
    num_contributions integer
  );

  create table if not exists donor_by_year (
    id bigint generated always as identity primary key,
    donor_slug text not null,
    year integer not null,
    soft numeric(15,2) default 0,
    hard numeric(15,2) default 0,
    total numeric(15,2) default 0
  );
  ```

- [ ] **Step 3: Create 002_candidates.sql**

  Create `supabase/migrations/002_candidates.sql`:
  ```sql
  create table if not exists candidates (
    id bigint generated always as identity primary key,
    acct_num text not null unique,
    candidate_name text,
    election_id text,
    election_year integer,
    office_code text,
    office_desc text,
    party_code text,
    district text,
    status_desc text,
    hard_money_total numeric(15,2) default 0,
    hard_corporate_total numeric(15,2) default 0,
    hard_individual_total numeric(15,2) default 0,
    hard_num_contributions integer default 0,
    soft_money_total numeric(15,2) default 0,
    total_combined numeric(15,2) default 0,
    num_linked_pcs integer default 0,
    extra jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists candidate_quarterly (
    id bigint generated always as identity primary key,
    acct_num text not null,
    quarter text not null,
    amount numeric(15,2) default 0
  );

  create table if not exists candidate_top_donors (
    id bigint generated always as identity primary key,
    acct_num text not null,
    donor_name text,
    donor_slug text,
    total_amount numeric(15,2),
    num_contributions integer,
    type text,
    occupation text
  );
  ```

- [ ] **Step 4: Create 003_committees.sql**

  Create `supabase/migrations/003_committees.sql`:
  ```sql
  create table if not exists committees (
    id bigint generated always as identity primary key,
    acct_num text not null unique,
    committee_name text,
    total_received numeric(15,2) default 0,
    num_contributions integer default 0,
    extra jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists committee_top_donors (
    id bigint generated always as identity primary key,
    acct_num text not null,
    donor_name text,
    donor_slug text,
    total_amount numeric(15,2),
    num_contributions integer,
    type text
  );
  ```

- [ ] **Step 5: Create 004_lobbyists.sql**

  Create `supabase/migrations/004_lobbyists.sql`:
  ```sql
  create table if not exists lobbyists (
    id bigint generated always as identity primary key,
    slug text not null unique,
    name text not null,
    firm text,
    city text,
    state text,
    phone text,
    num_principals integer default 0,
    num_active integer default 0,
    total_donation_influence numeric(15,2) default 0,
    has_donation_match boolean default false,
    top_principal text,
    extra jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists lobbyist_principals (
    id bigint generated always as identity primary key,
    lobbyist_slug text not null,
    principal_name text,
    is_active boolean default false,
    branch text,
    firm text,
    since text,
    until text,
    donation_total numeric(15,2) default 0,
    num_contributions integer default 0
  );
  ```

- [ ] **Step 6: Create 005_principals.sql**

  Create `supabase/migrations/005_principals.sql`:
  ```sql
  create table if not exists principals (
    id bigint generated always as identity primary key,
    slug text not null unique,
    name text not null,
    naics text,
    city text,
    state text,
    total_lobbyists integer default 0,
    num_active integer default 0,
    donation_total numeric(15,2) default 0,
    num_contributions integer default 0,
    industry text,
    extra jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table if not exists principal_lobbyists (
    id bigint generated always as identity primary key,
    principal_slug text not null,
    lobbyist_name text,
    lobbyist_slug text,
    firm text,
    branch text,
    is_active boolean default false,
    since text
  );

  create table if not exists principal_donation_matches (
    id bigint generated always as identity primary key,
    principal_slug text not null,
    contributor_name text,
    match_score numeric(5,2),
    total_donated numeric(15,2),
    num_contributions integer
  );
  ```

- [ ] **Step 7: Create 006_industries.sql**

  Create `supabase/migrations/006_industries.sql`:
  ```sql
  create table if not exists industry_buckets (
    id bigint generated always as identity primary key,
    industry text not null unique,
    total numeric(15,2) default 0,
    count integer default 0,
    pct numeric(6,3) default 0,
    updated_at timestamptz default now()
  );

  create table if not exists industry_by_committee (
    id bigint generated always as identity primary key,
    acct_num text not null,
    industry text not null,
    total numeric(15,2) default 0
  );

  create table if not exists industry_trends (
    id bigint generated always as identity primary key,
    year integer not null,
    industry text not null,
    total numeric(15,2) default 0
  );
  ```

- [ ] **Step 8: Create 007_analysis.sql**

  Create `supabase/migrations/007_analysis.sql`:
  ```sql
  create table if not exists entity_connections (
    id bigint generated always as identity primary key,
    entity_a text not null,
    entity_b text not null,
    connection_score integer default 0,
    shared_treasurer boolean default false,
    shared_address boolean default false,
    shared_phone boolean default false,
    shared_chair boolean default false,
    donor_overlap_pct numeric(6,3) default 0,
    money_between numeric(15,2) default 0
  );

  create table if not exists candidate_pc_links (
    id bigint generated always as identity primary key,
    candidate_acct_num text not null,
    pc_acct_num text not null,
    pc_name text,
    pc_type text,
    link_type text,
    confidence numeric(4,2)
  );

  create table if not exists cycle_donors (
    id bigint generated always as identity primary key,
    year integer not null,
    name text,
    slug text,
    total numeric(15,2) default 0,
    num_contributions integer default 0,
    is_corporate boolean default false
  );
  ```

- [ ] **Step 9: Create 008_indexes.sql**

  Create `supabase/migrations/008_indexes.sql`:
  ```sql
  -- donors
  create index if not exists idx_donors_slug on donors(slug);
  create index if not exists idx_donors_name on donors(name);
  create index if not exists idx_donors_industry on donors(industry);
  create index if not exists idx_donors_total_combined on donors(total_combined desc);

  -- donor child tables
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
  ```

- [ ] **Step 10: Commit all migration files**

  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker
  git add supabase/migrations/
  git commit -m "Add Supabase schema migrations (20 tables)"
  ```

---

## Task 5: Run Migrations in Supabase SQL Editor

You do this in the browser.

- [ ] **Step 1: Open SQL editor**

  In Supabase dashboard → left sidebar → **SQL Editor** → click **New query**

- [ ] **Step 2: Run migrations in order**

  For each file in order (001 through 008): copy the full contents of the file, paste into the SQL editor, click **Run**.

  After each file runs you should see: `Success. No rows returned`

- [ ] **Step 3: Verify tables were created**

  In Supabase dashboard → left sidebar → **Table Editor**

  You should see all 20 tables listed: donors, donor_committees, donor_candidates, donor_by_year, candidates, candidate_quarterly, candidate_top_donors, committees, committee_top_donors, lobbyists, lobbyist_principals, principals, principal_lobbyists, principal_donation_matches, industry_buckets, industry_by_committee, industry_trends, entity_connections, candidate_pc_links, cycle_donors.

---

## Task 6: Write the Python Loader Script

Create `scripts/40_load_supabase.py`:

```python
#!/usr/bin/env python3
"""
40_load_supabase.py
Bulk-loads all Florida Donor Tracker data from existing JSON/CSV files
into Supabase (Postgres). Run after any pipeline update to refresh the DB.

Usage:
    cd ~/Claude\ Projects/florida-donor-tracker
    python3 scripts/40_load_supabase.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

DATA_DIR = PROJECT_ROOT / "public" / "data"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

BATCH_SIZE = 2000  # rows per INSERT batch


# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(name):
    """Must match lib/slugify.js and script 25 logic exactly."""
    import re
    s = name.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def flush(cur, sql, rows, table_name):
    if not rows:
        return 0
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)
    return len(rows)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Loaders ───────────────────────────────────────────────────────────────────

def load_donors(cur):
    print("Loading donors...")
    index = load_json(DATA_DIR / "donors" / "index.json")
    rows = [
        (d["slug"], d["name"], d.get("is_corporate", False),
         d.get("total_soft", 0), d.get("total_hard", 0), d.get("total_combined", 0),
         d.get("num_contributions", 0), d.get("top_occupation"),
         d.get("top_location"), d.get("num_committees", 0),
         d.get("num_candidates", 0), d.get("has_lobbyist_link", False),
         d.get("industry"))
        for d in index
    ]
    n = flush(cur, """
        INSERT INTO donors
          (slug, name, is_corporate, total_soft, total_hard, total_combined,
           num_contributions, top_occupation, top_location, num_committees,
           num_candidates, has_lobbyist_link, industry)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, rows, "donors")
    print(f"  → {n} donors")


def load_donor_details(cur):
    print("Loading donor detail tables (committees, candidates, by_year)...")
    donors_dir = DATA_DIR / "donors"
    files = [f for f in donors_dir.glob("*.json") if f.name != "index.json"]
    total = len(files)

    dc_rows, dcan_rows, dy_rows = [], [], []

    for i, fpath in enumerate(files):
        if i % 5000 == 0:
            print(f"  {i}/{total}...")
        try:
            d = load_json(fpath)
        except Exception:
            continue

        slug = d.get("slug", fpath.stem)

        for c in d.get("committees", []):
            dc_rows.append((slug, c.get("acct_num"), c.get("committee_name"),
                            c.get("total"), c.get("num_contributions")))

        for c in d.get("candidates", []):
            dcan_rows.append((slug, c.get("acct_num"), c.get("candidate_name"),
                              c.get("total"), c.get("num_contributions")))

        for y in d.get("by_year", []):
            dy_rows.append((slug, y.get("year"), y.get("soft", 0),
                            y.get("hard", 0), y.get("total", 0)))

        # Flush periodically to avoid huge memory usage
        if len(dc_rows) >= BATCH_SIZE * 5:
            flush(cur, "INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions) VALUES %s", dc_rows, "donor_committees")
            dc_rows = []
        if len(dcan_rows) >= BATCH_SIZE * 5:
            flush(cur, "INSERT INTO donor_candidates (donor_slug, acct_num, candidate_name, total, num_contributions) VALUES %s", dcan_rows, "donor_candidates")
            dcan_rows = []
        if len(dy_rows) >= BATCH_SIZE * 5:
            flush(cur, "INSERT INTO donor_by_year (donor_slug, year, soft, hard, total) VALUES %s", dy_rows, "donor_by_year")
            dy_rows = []

    # Final flush
    flush(cur, "INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions) VALUES %s", dc_rows, "donor_committees")
    flush(cur, "INSERT INTO donor_candidates (donor_slug, acct_num, candidate_name, total, num_contributions) VALUES %s", dcan_rows, "donor_candidates")
    flush(cur, "INSERT INTO donor_by_year (donor_slug, year, soft, hard, total) VALUES %s", dy_rows, "donor_by_year")
    print(f"  → donor detail tables done")


def load_candidates(cur):
    print("Loading candidates...")
    stats = load_json(DATA_DIR / "candidate_stats.json")
    # Index stats by acct_num for merging with full profiles
    stats_map = {c["acct_num"]: c for c in stats}

    cand_rows = []
    quarterly_rows = []
    top_donor_rows = []

    cand_dir = DATA_DIR / "candidates"
    files = list(cand_dir.glob("*.json"))
    print(f"  Reading {len(files)} candidate profiles...")

    for fpath in files:
        try:
            d = load_json(fpath)
        except Exception:
            continue
        acct = d.get("acct_num")
        if not acct:
            continue

        hm = d.get("hard_money", {})
        cand_rows.append((
            str(acct), d.get("candidate_name"), d.get("election_id"),
            d.get("election_year"), d.get("office_code"), d.get("office_desc"),
            d.get("party_code"), d.get("district"), d.get("status_desc"),
            hm.get("total", 0), hm.get("corporate_total", 0),
            hm.get("individual_total", 0), hm.get("num_contributions", 0),
            d.get("soft_money_total", 0), d.get("total_combined", 0),
            len(d.get("linked_pcs", []))
        ))

        for quarter, amount in hm.get("by_quarter", {}).items():
            quarterly_rows.append((str(acct), quarter, amount))

        for td in hm.get("top_donors", []):
            donor_name = td.get("name", "")
            top_donor_rows.append((
                str(acct), donor_name, slugify(donor_name),
                td.get("total_amount"), td.get("num_contributions"),
                td.get("type"), td.get("occupation")
            ))

    flush(cur, """
        INSERT INTO candidates
          (acct_num, candidate_name, election_id, election_year, office_code,
           office_desc, party_code, district, status_desc, hard_money_total,
           hard_corporate_total, hard_individual_total, hard_num_contributions,
           soft_money_total, total_combined, num_linked_pcs)
        VALUES %s ON CONFLICT (acct_num) DO NOTHING
    """, cand_rows, "candidates")
    flush(cur, "INSERT INTO candidate_quarterly (acct_num, quarter, amount) VALUES %s", quarterly_rows, "candidate_quarterly")
    flush(cur, "INSERT INTO candidate_top_donors (acct_num, donor_name, donor_slug, total_amount, num_contributions, type, occupation) VALUES %s", top_donor_rows, "candidate_top_donors")
    print(f"  → {len(cand_rows)} candidates, {len(quarterly_rows)} quarterly rows, {len(top_donor_rows)} top donor rows")


def load_committees(cur):
    print("Loading committees...")
    index = load_json(DATA_DIR / "committees" / "index.json")
    comm_rows = [(c["acct_num"], c.get("committee_name"), c.get("total_received", 0), c.get("num_contributions", 0))
                 for c in index]
    flush(cur, """
        INSERT INTO committees (acct_num, committee_name, total_received, num_contributions)
        VALUES %s ON CONFLICT (acct_num) DO NOTHING
    """, comm_rows, "committees")
    print(f"  → {len(comm_rows)} committees")

    # Load top donors from individual committee files
    print("  Loading committee top donors...")
    comm_dir = DATA_DIR / "committees"
    td_rows = []
    for fpath in comm_dir.glob("*.json"):
        if fpath.name == "index.json":
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        if "committee_name" not in d:
            continue  # skip non-profile files
        acct = d.get("acct_num")
        for td in d.get("top_donors", []):
            donor_name = td.get("name", "")
            td_rows.append((str(acct), donor_name, slugify(donor_name),
                            td.get("total_amount"), td.get("num_contributions"),
                            td.get("type")))
    flush(cur, "INSERT INTO committee_top_donors (acct_num, donor_name, donor_slug, total_amount, num_contributions, type) VALUES %s", td_rows, "committee_top_donors")
    print(f"  → {len(td_rows)} committee top donor rows")


def load_lobbyists(cur):
    print("Loading lobbyists...")
    index = load_json(DATA_DIR / "lobbyists" / "index.json")
    lob_rows = [
        (d["slug"], d["name"], d.get("firm"), d.get("city"), d.get("state"),
         d.get("phone"), d.get("num_principals", 0), d.get("num_active", 0),
         d.get("total_donation_influence", 0), d.get("has_donation_match", False),
         d.get("top_principal"))
        for d in index
    ]
    flush(cur, """
        INSERT INTO lobbyists
          (slug, name, firm, city, state, phone, num_principals, num_active,
           total_donation_influence, has_donation_match, top_principal)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, lob_rows, "lobbyists")
    print(f"  → {len(lob_rows)} lobbyists")

    print("  Loading lobbyist principals...")
    lob_dir = DATA_DIR / "lobbyists"
    lp_rows = []
    for fpath in lob_dir.glob("*.json"):
        if fpath.name == "index.json":
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        slug = d.get("slug", fpath.stem)
        for p in d.get("principals", []):
            lp_rows.append((
                slug, p.get("name"), p.get("is_active", False),
                p.get("branch"), p.get("firm"), p.get("since"), p.get("until"),
                p.get("donation_total", 0), p.get("num_contributions", 0)
            ))
    flush(cur, """
        INSERT INTO lobbyist_principals
          (lobbyist_slug, principal_name, is_active, branch, firm, since, until,
           donation_total, num_contributions)
        VALUES %s
    """, lp_rows, "lobbyist_principals")
    print(f"  → {len(lp_rows)} lobbyist_principal rows")


def load_principals(cur):
    print("Loading principals...")
    index = load_json(DATA_DIR / "principals" / "index.json")
    pri_rows = [
        (d["slug"], d["name"], d.get("naics"), d.get("city"), d.get("state"),
         d.get("total_lobbyists", 0), d.get("num_active", 0),
         d.get("donation_total", 0), d.get("num_contributions", 0),
         d.get("industry"))
        for d in index
    ]
    flush(cur, """
        INSERT INTO principals
          (slug, name, naics, city, state, total_lobbyists, num_active,
           donation_total, num_contributions, industry)
        VALUES %s ON CONFLICT (slug) DO NOTHING
    """, pri_rows, "principals")
    print(f"  → {len(pri_rows)} principals")

    print("  Loading principal detail tables...")
    pri_dir = DATA_DIR / "principals"
    pl_rows = []
    pdm_rows = []
    for fpath in pri_dir.glob("*.json"):
        if fpath.name == "index.json":
            continue
        try:
            d = load_json(fpath)
        except Exception:
            continue
        slug = d.get("slug", fpath.stem)
        for lob in d.get("lobbyists", []):
            lob_name = lob.get("lobbyist_name", "")
            pl_rows.append((slug, lob_name, slugify(lob_name),
                            lob.get("firm"), lob.get("branch"),
                            lob.get("is_active", False), lob.get("since")))
        for dm in d.get("donation_matches", []):
            pdm_rows.append((slug, dm.get("contributor_name"),
                             dm.get("match_score"), dm.get("total_donated"),
                             dm.get("num_contributions")))
    flush(cur, """
        INSERT INTO principal_lobbyists
          (principal_slug, lobbyist_name, lobbyist_slug, firm, branch, is_active, since)
        VALUES %s
    """, pl_rows, "principal_lobbyists")
    flush(cur, """
        INSERT INTO principal_donation_matches
          (principal_slug, contributor_name, match_score, total_donated, num_contributions)
        VALUES %s
    """, pdm_rows, "principal_donation_matches")
    print(f"  → {len(pl_rows)} principal_lobbyist rows, {len(pdm_rows)} donation match rows")


def load_industries(cur):
    print("Loading industry tables...")

    # industry_buckets
    summary = load_json(DATA_DIR / "industry_summary.json")
    bucket_rows = [(ind["industry"], ind.get("total", 0), ind.get("count", 0), ind.get("pct", 0))
                   for ind in summary["industries"]]
    flush(cur, "INSERT INTO industry_buckets (industry, total, count, pct) VALUES %s ON CONFLICT (industry) DO NOTHING",
          bucket_rows, "industry_buckets")
    print(f"  → {len(bucket_rows)} industry buckets")

    # industry_by_committee
    ind_dir = DATA_DIR / "industries"
    ibc_rows = []
    for fpath in ind_dir.glob("*.json"):
        try:
            d = load_json(fpath)
        except Exception:
            continue
        acct = d.get("acct_num")
        for entry in d.get("by_industry", []):
            ibc_rows.append((str(acct), entry.get("industry"), entry.get("total", 0)))
    flush(cur, "INSERT INTO industry_by_committee (acct_num, industry, total) VALUES %s", ibc_rows, "industry_by_committee")
    print(f"  → {len(ibc_rows)} industry_by_committee rows")

    # industry_trends
    trends = load_json(DATA_DIR / "industry_trends.json")
    it_rows = []
    for year, data in trends.get("by_year", {}).items():
        for industry, total in data.get("by_industry", {}).items():
            it_rows.append((int(year), industry, total))
    flush(cur, "INSERT INTO industry_trends (year, industry, total) VALUES %s", it_rows, "industry_trends")
    print(f"  → {len(it_rows)} industry_trend rows")


def load_analysis(cur):
    print("Loading analysis tables...")

    # entity_connections
    ec = load_json(DATA_DIR / "entity_connections.json")
    ec_rows = [
        (c["entity_a"], c["entity_b"], c.get("connection_score", 0),
         c.get("shared_treasurer", False), c.get("shared_address", False),
         c.get("shared_phone", False), c.get("shared_chair", False),
         c.get("donor_overlap_pct", 0), c.get("money_between", 0))
        for c in ec.get("connections", [])
    ]
    flush(cur, """
        INSERT INTO entity_connections
          (entity_a, entity_b, connection_score, shared_treasurer, shared_address,
           shared_phone, shared_chair, donor_overlap_pct, money_between)
        VALUES %s
    """, ec_rows, "entity_connections")
    print(f"  → {len(ec_rows)} entity connections")

    # candidate_pc_links
    pc_links = load_json(DATA_DIR / "candidate_pc_links.json")
    pcl_rows = []
    for cand_acct, links in pc_links.items():
        for link in links:
            pcl_rows.append((str(cand_acct), str(link.get("pc_acct")),
                             link.get("pc_name"), link.get("pc_type"),
                             link.get("link_type"), link.get("confidence")))
    flush(cur, """
        INSERT INTO candidate_pc_links
          (candidate_acct_num, pc_acct_num, pc_name, pc_type, link_type, confidence)
        VALUES %s
    """, pcl_rows, "candidate_pc_links")
    print(f"  → {len(pcl_rows)} candidate_pc_links")

    # cycle_donors
    cd = load_json(DATA_DIR / "cycle_donors.json")
    cd_rows = []
    for year, donors in cd.items():
        for d in donors:
            cd_rows.append((int(year), d.get("name"), slugify(d.get("name", "")),
                            d.get("total", 0), d.get("num_contributions", 0),
                            d.get("is_corporate", False)))
    flush(cur, """
        INSERT INTO cycle_donors (year, name, slug, total, num_contributions, is_corporate)
        VALUES %s
    """, cd_rows, "cycle_donors")
    print(f"  → {len(cd_rows)} cycle donor rows")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Connecting to Supabase...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("\nTruncating all tables for clean load...")
        cur.execute("""
            TRUNCATE TABLE
              donors, donor_committees, donor_candidates, donor_by_year,
              candidates, candidate_quarterly, candidate_top_donors,
              committees, committee_top_donors,
              lobbyists, lobbyist_principals,
              principals, principal_lobbyists, principal_donation_matches,
              industry_buckets, industry_by_committee, industry_trends,
              entity_connections, candidate_pc_links, cycle_donors
            RESTART IDENTITY CASCADE
        """)
        conn.commit()

        print("\n── Loading data ──────────────────────────────────")
        load_donors(cur); conn.commit()
        load_donor_details(cur); conn.commit()
        load_candidates(cur); conn.commit()
        load_committees(cur); conn.commit()
        load_lobbyists(cur); conn.commit()
        load_principals(cur); conn.commit()
        load_industries(cur); conn.commit()
        load_analysis(cur); conn.commit()

        print("\n── Verifying row counts ──────────────────────────")
        tables = [
            "donors", "donor_committees", "donor_candidates", "donor_by_year",
            "candidates", "candidate_quarterly", "candidate_top_donors",
            "committees", "committee_top_donors",
            "lobbyists", "lobbyist_principals",
            "principals", "principal_lobbyists", "principal_donation_matches",
            "industry_buckets", "industry_by_committee", "industry_trends",
            "entity_connections", "candidate_pc_links", "cycle_donors"
        ]
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            print(f"  {table}: {count:,}")

        print("\n✓ Load complete.")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
```

- [ ] **Commit the loader script**

  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker
  git add scripts/40_load_supabase.py
  git commit -m "Add Supabase bulk loader script (40_load_supabase.py)"
  ```

---

## Task 7: Run the Loader and Verify

- [ ] **Step 1: Run the loader**

  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker
  python3 scripts/40_load_supabase.py
  ```

  This will take 5–15 minutes. You'll see progress output for each table. Expected output:
  ```
  Connecting to Supabase...
  Truncating all tables for clean load...
  Loading donors...
    → 44313 donors
  Loading donor detail tables...
    0/44313...
    5000/44313...
    ...
  Loading candidates...
    → 6940 candidates, ...
  ...
  ── Verifying row counts ──────────────────────────
    donors: 44,313
    donor_committees: ~180,000
    donor_candidates: ~70,000
    donor_by_year: ~160,000
    candidates: 6,940
    candidate_quarterly: ~55,000
    candidate_top_donors: ~65,000
    committees: 4,440
    committee_top_donors: ~40,000
    lobbyists: 2,474
    lobbyist_principals: ~12,000
    principals: 4,035
    principal_lobbyists: ~12,000
    principal_donation_matches: ~20,000
    industry_buckets: 15
    industry_by_committee: ~65,000
    industry_trends: 150
    entity_connections: 500
    candidate_pc_links: ~636
    cycle_donors: 200
  ✓ Load complete.
  ```

- [ ] **Step 2: Spot-check in Supabase dashboard**

  In Supabase dashboard → **Table Editor** → click **donors** → verify you see rows with real names and amounts. Check that `FLORIDA POWER & LIGHT COMPANY` appears with `total_combined` around 330,985,212.

- [ ] **Step 3: Run a cross-table query to verify linkage**

  In Supabase SQL editor, run:
  ```sql
  SELECT d.name, d.total_combined, dc.committee_name, dc.total
  FROM donors d
  JOIN donor_committees dc ON dc.donor_slug = d.slug
  WHERE d.slug = 'florida-power-light-company'
  ORDER BY dc.total DESC
  LIMIT 5;
  ```

  Expected: 5 rows showing FPL's top committee donations.

- [ ] **Step 4: Check database size**

  In Supabase dashboard → **Project Settings** → **Database** → check used storage. Should be under 400MB (within free tier's 500MB limit).

  > If it exceeds 500MB, upgrade to Supabase Pro ($25/month) before proceeding to Phase 2.

---

## What's Next

Phase 1 is complete when the loader finishes and all row counts look right. The database is loaded but the website still reads from JSON files — nothing has changed for visitors yet.

**Phase 2 plan** (separate document) covers:
- Adding Next.js API routes that query Supabase
- Migrating each page to use the API instead of JSON files
- Removing the `public/data/` JSON files and speeding up builds
