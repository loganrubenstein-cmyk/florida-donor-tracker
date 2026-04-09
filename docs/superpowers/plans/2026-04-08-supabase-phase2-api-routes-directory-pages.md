# Supabase Phase 2: API Routes & Directory Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace client-side JSON fetches in all 5 directory pages with server-side Supabase API routes, so search/filter/sort runs in SQL instead of loading full indexes in the browser.

**Architecture:** Each directory page component (`DonorsList`, `CandidatesList`, etc.) currently fetches a full JSON index file and filters in memory. This plan replaces those fetches with calls to new Next.js API routes (`/api/donors`, `/api/candidates`, etc.) that query Supabase with server-side filtering, sorting, and pagination. Profile pages (`/donor/[slug]`, etc.) are NOT touched in this phase — they continue reading JSON files. The public JSON files are NOT deleted yet.

**Tech Stack:** Next.js 14 App Router route handlers, @supabase/supabase-js, Supabase Postgres (20 tables loaded in Phase 1)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/db.js` | Create | Server-side Supabase client (service role, never sent to browser) |
| `app/api/donors/route.js` | Create | Paginated donor search with filters |
| `app/api/candidates/route.js` | Create | Paginated candidate search with filters |
| `app/api/committees/route.js` | Create | Paginated committee search with filters |
| `app/api/lobbyists/route.js` | Create | Paginated lobbyist search with filters |
| `app/api/principals/route.js` | Create | Paginated principal search with filters |
| `components/donors/DonorsList.js` | Modify | Fetch from /api/donors instead of JSON file |
| `components/candidate/CandidatesList.js` | Modify | Fetch from /api/candidates instead of JSON file |
| `components/committees/CommitteesList.js` | Modify | Fetch from /api/committees instead of JSON file |
| `components/lobbyists/LobbyistsList.js` | Modify | Fetch from /api/lobbyists instead of JSON file |
| `components/principals/PrincipalsList.js` | Modify | Fetch from /api/principals instead of JSON file |

---

## Task 1: Server-Side Supabase Client

**Files:**
- Create: `lib/db.js`

- [ ] **Step 1: Create lib/db.js**

  ```js
  // lib/db.js
  // Server-only Supabase client using the service role key.
  // Never import this in client components — it exposes the service role key.
  import { createClient } from '@supabase/supabase-js';

  export function getDb() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  ```

- [ ] **Step 2: Verify the env vars are set**

  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker
  node -e "require('dotenv').config({ path: '.env.local' }); console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING'); console.log('SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING');"
  ```

  Expected:
  ```
  URL: set
  SERVICE_ROLE: set
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add lib/db.js
  git commit -m "Add server-side Supabase client (lib/db.js)"
  ```

---

## Task 2: Donors API Route

**Files:**
- Create: `app/api/donors/route.js`

- [ ] **Step 1: Create app/api/donors/route.js**

  ```js
  import { NextResponse } from 'next/server';
  import { getDb } from '@/lib/db';

  const PAGE_SIZE = 50;

  export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q        = searchParams.get('q') || '';
    const type     = searchParams.get('type') || 'all';
    const industry = searchParams.get('industry') || 'all';
    const sort     = searchParams.get('sort') || 'total_combined';
    const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

    const db = getDb();
    let query = db
      .from('donors')
      .select(
        'slug, name, is_corporate, total_combined, total_soft, total_hard, num_contributions, top_location, num_committees, has_lobbyist_link, industry',
        { count: 'exact' }
      )
      .gte('total_combined', 1000);

    if (q.trim())           query = query.ilike('name', `%${q.trim()}%`);
    if (type === 'corporate')  query = query.eq('is_corporate', true);
    if (type === 'individual') query = query.eq('is_corporate', false);
    if (type === 'lobbyist')   query = query.eq('has_lobbyist_link', true);
    if (industry !== 'all')    query = query.eq('industry', industry);

    const ascending = sort === 'name';
    query = query.order(sort, { ascending });

    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / PAGE_SIZE),
    });
  }
  ```

- [ ] **Step 2: Test the route**

  Start the dev server if not running:
  ```bash
  cd ~/Claude\ Projects/florida-donor-tracker && npm run dev
  ```

  In a new terminal, test the route:
  ```bash
  curl "http://localhost:3000/api/donors?q=florida+power&page=1" | python3 -m json.tool | head -30
  ```

  Expected: JSON with `data` array, `total`, `page`, `pages` fields. `data[0].name` should be `FLORIDA POWER & LIGHT COMPANY`.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/donors/route.js
  git commit -m "Add /api/donors route"
  ```

---

## Task 3: Candidates API Route

**Files:**
- Create: `app/api/candidates/route.js`

- [ ] **Step 1: Create app/api/candidates/route.js**

  ```js
  import { NextResponse } from 'next/server';
  import { getDb } from '@/lib/db';

  const PAGE_SIZE = 50;

  export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q      = searchParams.get('q') || '';
    const party  = searchParams.get('party') || 'all';
    const office = searchParams.get('office') || 'all';
    const year   = searchParams.get('year') || 'all';
    const sort   = searchParams.get('sort') || 'total_combined';
    const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

    const db = getDb();
    let query = db
      .from('candidates')
      .select(
        'acct_num, candidate_name, election_year, office_desc, party_code, district, hard_money_total, soft_money_total, total_combined, num_hard_contributions, num_linked_pcs',
        { count: 'exact' }
      );

    if (q.trim())      query = query.ilike('candidate_name', `%${q.trim()}%`);
    if (party !== 'all')  query = query.eq('party_code', party);
    if (office !== 'all') query = query.ilike('office_desc', `%${office}%`);
    if (year !== 'all')   query = query.eq('election_year', parseInt(year, 10));

    const ascending = sort === 'candidate_name';
    query = query.order(sort, { ascending });

    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / PAGE_SIZE),
    });
  }
  ```

- [ ] **Step 2: Test**

  ```bash
  curl "http://localhost:3000/api/candidates?q=desantis&page=1" | python3 -m json.tool | head -20
  ```

  Expected: JSON with candidates matching "desantis" in their name.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/candidates/route.js
  git commit -m "Add /api/candidates route"
  ```

---

## Task 4: Committees API Route

**Files:**
- Create: `app/api/committees/route.js`

- [ ] **Step 1: Create app/api/committees/route.js**

  ```js
  import { NextResponse } from 'next/server';
  import { getDb } from '@/lib/db';

  const PAGE_SIZE = 50;

  const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
  const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];

  export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q     = searchParams.get('q') || '';
    const party = searchParams.get('party') || 'all';
    const sort  = searchParams.get('sort') || 'total_received';
    const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

    const db = getDb();
    let query = db
      .from('committees')
      .select('acct_num, committee_name, total_received, num_contributions', { count: 'exact' });

    if (q.trim()) query = query.ilike('committee_name', `%${q.trim()}%`);

    const ascending = sort === 'committee_name';
    const sortCol = sort === 'contributions' ? 'num_contributions' : sort === 'name' ? 'committee_name' : 'total_received';
    query = query.order(sortCol, { ascending });

    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Apply party filter client-side (heuristic name matching, can't do in SQL)
    let filtered = data || [];
    if (party === 'R') {
      filtered = filtered.filter(c => R_KW.some(k => (c.committee_name || '').toUpperCase().includes(k)));
    } else if (party === 'D') {
      filtered = filtered.filter(c => D_KW.some(k => (c.committee_name || '').toUpperCase().includes(k)));
    }

    return NextResponse.json({
      data: filtered,
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / PAGE_SIZE),
    });
  }
  ```

- [ ] **Step 2: Test**

  ```bash
  curl "http://localhost:3000/api/committees?q=republican&page=1" | python3 -m json.tool | head -20
  ```

  Expected: committees with "republican" in their name.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/committees/route.js
  git commit -m "Add /api/committees route"
  ```

---

## Task 5: Lobbyists & Principals API Routes

**Files:**
- Create: `app/api/lobbyists/route.js`
- Create: `app/api/principals/route.js`

- [ ] **Step 1: Create app/api/lobbyists/route.js**

  ```js
  import { NextResponse } from 'next/server';
  import { getDb } from '@/lib/db';

  const PAGE_SIZE = 50;

  export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q    = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all';
    const sort = searchParams.get('sort') || 'total_donation_influence';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

    const db = getDb();
    let query = db
      .from('lobbyists')
      .select(
        'slug, name, firm, city, state, num_principals, num_active, total_donation_influence, has_donation_match, top_principal',
        { count: 'exact' }
      );

    if (q.trim()) {
      query = query.or(
        `name.ilike.%${q.trim()}%,firm.ilike.%${q.trim()}%,top_principal.ilike.%${q.trim()}%`
      );
    }
    if (type === 'matched') query = query.eq('has_donation_match', true);
    if (type === 'active')  query = query.gt('num_active', 0);

    const ascending = sort === 'name';
    query = query.order(sort, { ascending });

    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / PAGE_SIZE),
    });
  }
  ```

- [ ] **Step 2: Create app/api/principals/route.js**

  ```js
  import { NextResponse } from 'next/server';
  import { getDb } from '@/lib/db';

  const PAGE_SIZE = 50;

  export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q        = searchParams.get('q') || '';
    const type     = searchParams.get('type') || 'all';
    const industry = searchParams.get('industry') || 'all';
    const sort     = searchParams.get('sort') || 'donation_total';
    const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

    const db = getDb();
    let query = db
      .from('principals')
      .select(
        'slug, name, naics, city, state, total_lobbyists, num_active, donation_total, num_contributions, industry',
        { count: 'exact' }
      );

    if (q.trim()) {
      query = query.or(`name.ilike.%${q.trim()}%,city.ilike.%${q.trim()}%`);
    }
    if (type === 'matched') query = query.gt('donation_total', 0);
    if (type === 'active')  query = query.gt('num_active', 0);
    if (industry !== 'all') query = query.eq('industry', industry);

    const sortCol = sort === 'total_lobbyists' ? 'total_lobbyists' : sort === 'name' ? 'name' : 'donation_total';
    const ascending = sort === 'name';
    query = query.order(sortCol, { ascending });

    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / PAGE_SIZE),
    });
  }
  ```

- [ ] **Step 3: Test both routes**

  ```bash
  curl "http://localhost:3000/api/lobbyists?q=smith&page=1" | python3 -m json.tool | head -15
  curl "http://localhost:3000/api/principals?industry=Healthcare&page=1" | python3 -m json.tool | head -15
  ```

  Expected: both return valid JSON with `data`, `total`, `page`, `pages`.

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/lobbyists/route.js app/api/principals/route.js
  git commit -m "Add /api/lobbyists and /api/principals routes"
  ```

---

## Task 6: Update DonorsList Component

**Files:**
- Modify: `components/donors/DonorsList.js`

- [ ] **Step 1: Rewrite DonorsList.js**

  Replace the entire file with:

  ```js
  'use client';

  import { useState, useEffect, useCallback } from 'react';
  import BackLinks from '@/components/BackLinks';

  function fmt(n) {
    if (!n || n === 0) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const SORT_OPTIONS = [
    { value: 'total_combined', label: 'Total (Combined)' },
    { value: 'total_soft',     label: 'Soft Money (PACs)' },
    { value: 'total_hard',     label: 'Hard Money (Direct)' },
    { value: 'name',           label: 'Name A–Z' },
  ];

  const TYPE_OPTIONS = [
    { value: 'all',        label: 'All Donors' },
    { value: 'corporate',  label: 'Corporate / Org' },
    { value: 'individual', label: 'Individual' },
    { value: 'lobbyist',   label: 'Has Lobbyist Link' },
  ];

  const INDUSTRY_OPTIONS = [
    { value: 'all',                         label: 'All Industries' },
    { value: 'Legal',                       label: 'Legal' },
    { value: 'Real Estate',                 label: 'Real Estate' },
    { value: 'Healthcare',                  label: 'Healthcare' },
    { value: 'Finance & Insurance',         label: 'Finance & Insurance' },
    { value: 'Agriculture',                 label: 'Agriculture' },
    { value: 'Construction',                label: 'Construction' },
    { value: 'Education',                   label: 'Education' },
    { value: 'Technology / Engineering',    label: 'Tech / Engineering' },
    { value: 'Retail & Hospitality',        label: 'Retail & Hospitality' },
    { value: 'Business & Consulting',       label: 'Business & Consulting' },
    { value: 'Government & Public Service', label: 'Government' },
    { value: 'Political / Lobbying',        label: 'Political / Lobbying' },
    { value: 'Retired',                     label: 'Retired' },
    { value: 'Not Employed',                label: 'Not Employed' },
    { value: 'Other',                       label: 'Other' },
  ];

  const PAGE_SIZE = 50;

  export default function DonorsList() {
    const [results, setResults]   = useState({ data: [], total: 0, pages: 0 });
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [type, setType]         = useState('all');
    const [industry, setIndustry] = useState('all');
    const [sortBy, setSortBy]     = useState('total_combined');
    const [page, setPage]         = useState(1);

    // Debounce search input by 300ms
    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    // Reset to page 1 when filters change
    useEffect(() => { setPage(1); }, [debouncedQ, type, industry, sortBy]);

    // Fetch from API
    useEffect(() => {
      setLoading(true);
      const params = new URLSearchParams({
        q: debouncedQ, type, industry, sort: sortBy, page,
      });
      fetch(`/api/donors?${params}`)
        .then(r => r.json())
        .then(json => { setResults(json); setLoading(false); })
        .catch(() => setLoading(false));
    }, [debouncedQ, type, industry, sortBy, page]);

    const inputStyle = {
      background: '#0d0d22', border: '1px solid var(--border)',
      color: 'var(--text)', padding: '0.4rem 0.6rem',
      fontSize: '0.72rem', borderRadius: '3px',
      fontFamily: 'var(--font-mono)', outline: 'none',
    };

    const { data: pageItems, total, pages: totalPages } = results;

    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

        <BackLinks links={[{ href: '/', label: 'home' }]} />

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
          }}>
            Donors
          </h1>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>Donors with $1K+ in contributions · Florida Division of Elections</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
          marginBottom: '1.25rem', alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search by donor name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, minWidth: '220px', flexGrow: 1 }}
          />
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle}>
            {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Result count */}
        <div style={{
          fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: '0.6rem',
        }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  { label: '#',          align: 'center', width: '2rem' },
                  { label: 'Donor',      align: 'left'   },
                  { label: 'Type',       align: 'center' },
                  { label: 'Location',   align: 'left'   },
                  { label: 'Committees', align: 'right'  },
                  { label: 'Soft Money', align: 'right', sortKey: 'total_soft'     },
                  { label: 'Hard Money', align: 'right', sortKey: 'total_hard'     },
                  { label: 'Combined',   align: 'right', sortKey: 'total_combined' },
                ].map(({ label, align, width, sortKey }) => (
                  <th key={label} style={{
                    padding: '0.4rem 0.6rem', textAlign: align, width,
                    fontSize: '0.6rem',
                    color: sortKey && sortBy === sortKey ? 'var(--text)' : 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  }}>
                    {label}{sortKey && sortBy === sortKey && (
                      <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>↓</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={8} style={{
                    padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                    fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                  }}>
                    No donors match the current filters
                  </td>
                </tr>
              )}
              {pageItems.map((d, i) => {
                const typeColor = d.is_corporate ? 'var(--orange)' : 'var(--teal)';
                const typeLabel = d.is_corporate ? 'CORP' : 'IND';
                const loc = d.top_location
                  ? d.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()
                  : '—';
                return (
                  <tr key={d.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                      <a href={`/donor/${d.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {d.name}
                      </a>
                      {d.has_lobbyist_link && (
                        <span style={{
                          marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--blue)',
                          border: '1px solid var(--blue)', borderRadius: '2px',
                          padding: '0.05rem 0.25rem', verticalAlign: 'middle',
                        }}>LOBBY</span>
                      )}
                      {d.industry && d.industry !== 'Not Employed' && d.industry !== 'Other' && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                          {d.industry}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                        border: `1px solid ${typeColor}`, color: typeColor,
                        borderRadius: '2px', fontWeight: 'bold',
                      }}>
                        {typeLabel}
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
                      {loc}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {d.num_committees}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {d.total_soft > 0 ? fmt(d.total_soft) : '—'}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {d.total_hard > 0 ? fmt(d.total_hard) : '—'}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--orange)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {fmt(d.total_combined)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '0.25rem 0.65rem', fontSize: '0.65rem',
                background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
                color: page === 1 ? 'var(--text-dim)' : 'var(--text)', cursor: page === 1 ? 'default' : 'pointer',
                borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === 1 ? 0.4 : 1,
              }}
            >← prev</button>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: '0.25rem 0.65rem', fontSize: '0.65rem',
                background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
                color: page === totalPages ? 'var(--text-dim)' : 'var(--text)', cursor: page === totalPages ? 'default' : 'pointer',
                borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === totalPages ? 0.4 : 1,
              }}
            >next →</button>
          </div>
        )}

        <div style={{
          fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
          borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
        }}>
          Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 2: Verify /donors page loads**

  Open `http://localhost:3000/donors` in the browser.

  Expected:
  - Page loads with a table of donors
  - Typing in the search box updates results after ~300ms
  - Changing filters updates results
  - Pagination works

- [ ] **Step 3: Commit**

  ```bash
  git add components/donors/DonorsList.js
  git commit -m "DonorsList: fetch from /api/donors (server-side search)"
  ```

---

## Task 7: Update CandidatesList Component

**Files:**
- Modify: `components/candidate/CandidatesList.js`

- [ ] **Step 1: Replace the data loading section**

  The CandidatesList is 333 lines. Replace only the state + data loading + filtering logic at the top, keeping all the UI JSX intact. The key change is lines 1-90 approximately.

  Replace the opening of the component (everything from `export default function CandidatesList()` through the end of the `useMemo` blocks) with:

  ```js
  'use client';

  import { useState, useEffect } from 'react';
  import BackLinks from '@/components/BackLinks';

  const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
  const PARTY_LABEL = {
    REP: 'Republican', DEM: 'Democrat',
    NPA: 'No Party', IND: 'Independent',
    LPF: 'Libertarian', GRE: 'Green',
    NOP: 'No Party', WRI: 'Write-in',
    CPF: 'CPF', ASP: 'ASP',
  };

  const MAJOR_OFFICES = [
    'Governor', 'State Senator', 'State Representative',
    'Attorney General', 'Chief Financial Officer', 'Commissioner of Agriculture',
    'State Attorney', 'Circuit Judge', 'Public Defender',
  ];

  function fmt(n) {
    if (!n || n === 0) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const SORT_OPTIONS = [
    { value: 'total_combined',    label: 'Combined Total' },
    { value: 'hard_money_total',  label: 'Hard Money' },
    { value: 'soft_money_total',  label: 'Soft Money' },
    { value: 'candidate_name',    label: 'Name A–Z' },
  ];

  const PAGE_SIZE = 50;

  export default function CandidatesList() {
    const [results, setResults] = useState({ data: [], total: 0, pages: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [party, setParty]     = useState('all');
    const [office, setOffice]   = useState('all');
    const [year, setYear]       = useState('all');
    const [sortBy, setSortBy]   = useState('total_combined');
    const [page, setPage]       = useState(1);

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedQ, party, office, year, sortBy]);

    useEffect(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: debouncedQ, party, office, year, sort: sortBy, page });
      fetch(`/api/candidates?${params}`)
        .then(r => r.json())
        .then(json => { setResults(json); setLoading(false); })
        .catch(() => setLoading(false));
    }, [debouncedQ, party, office, year, sortBy, page]);

    const { data: pageItems, total, pages: totalPages } = results;

    // Static year options (won't change often)
    const years = [2026, 2024, 2022, 2020, 2018, 2016, 2014, 2012, 2010, 2008, 2006];
    const offices = ['all', ...MAJOR_OFFICES, 'Other'];
  ```

  Then keep all the existing JSX render code but replace references:
  - `filtered.length` → `total`
  - `pageItems` stays the same (it's now `results.data`)
  - `totalPages` stays the same
  - Remove the `years` and `offices` derived from `useMemo` (replaced with static arrays above)
  - Add `opacity: loading ? 0.5 : 1` on the table wrapper div
  - Change the loading spinner check from `if (!candidates)` to `if (loading && pageItems.length === 0)`

- [ ] **Step 2: Verify /candidates loads**

  Open `http://localhost:3000/candidates`.

  Expected: candidates list loads, search and filters work.

- [ ] **Step 3: Commit**

  ```bash
  git add components/candidate/CandidatesList.js
  git commit -m "CandidatesList: fetch from /api/candidates"
  ```

---

## Task 8: Update CommitteesList Component

**Files:**
- Modify: `components/committees/CommitteesList.js`

- [ ] **Step 1: Replace the data loading section in CommitteesList.js**

  Replace from `export default function CommitteesList()` through the end of the `useMemo` blocks:

  ```js
  export default function CommitteesList() {
    const [results, setResults] = useState({ data: [], total: 0, pages: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [sort, setSort]       = useState('total_received');
    const [party, setParty]     = useState('all');
    const [page, setPage]       = useState(1);

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedQ, sort, party]);

    useEffect(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: debouncedQ, sort, party, page });
      fetch(`/api/committees?${params}`)
        .then(r => r.json())
        .then(json => { setResults(json); setLoading(false); })
        .catch(() => setLoading(false));
    }, [debouncedQ, sort, party, page]);

    const { data: filtered, total, pages: totalPages } = results;
    const pageItems = filtered; // API already paginates
  ```

  Then update the JSX:
  - Replace `committees.length` / `filtered.length` with `total`
  - Replace `loading` check (from `const [loading, setLoading] = useState(true)`)
  - Add `opacity: loading ? 0.5 : 1` on the table wrapper

- [ ] **Step 2: Verify /committees loads**

  Open `http://localhost:3000/committees`. Expected: committee list loads and search works.

- [ ] **Step 3: Commit**

  ```bash
  git add components/committees/CommitteesList.js
  git commit -m "CommitteesList: fetch from /api/committees"
  ```

---

## Task 9: Update LobbyistsList and PrincipalsList Components

**Files:**
- Modify: `components/lobbyists/LobbyistsList.js`
- Modify: `components/principals/PrincipalsList.js`

- [ ] **Step 1: Replace data loading in LobbyistsList.js**

  Replace from `export default function LobbyistsList()` through the `useMemo` filtering block:

  ```js
  export default function LobbyistsList() {
    const [results, setResults] = useState({ data: [], total: 0, pages: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [type, setType]       = useState('all');
    const [sortBy, setSortBy]   = useState('total_donation_influence');
    const [page, setPage]       = useState(1);

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedQ, type, sortBy]);

    useEffect(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: debouncedQ, type, sort: sortBy, page });
      fetch(`/api/lobbyists?${params}`)
        .then(r => r.json())
        .then(json => { setResults(json); setLoading(false); })
        .catch(() => setLoading(false));
    }, [debouncedQ, type, sortBy, page]);

    const { data: pageItems, total, pages: totalPages } = results;
  ```

  Update JSX references: `filtered.length` → `total`, remove `useMemo` filtered/pageItems.

- [ ] **Step 2: Replace data loading in PrincipalsList.js**

  Replace from `export default function PrincipalsList()` through the `useMemo` filtering block:

  ```js
  export default function PrincipalsList() {
    const [results, setResults]   = useState({ data: [], total: 0, pages: 0 });
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [type, setType]         = useState('all');
    const [industry, setIndustry] = useState('all');
    const [sortBy, setSortBy]     = useState('donation_total');
    const [page, setPage]         = useState(1);

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedQ, type, industry, sortBy]);

    useEffect(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: debouncedQ, type, industry, sort: sortBy, page });
      fetch(`/api/principals?${params}`)
        .then(r => r.json())
        .then(json => { setResults(json); setLoading(false); })
        .catch(() => setLoading(false));
    }, [debouncedQ, type, industry, sortBy, page]);

    const { data: pageItems, total, pages: totalPages } = results;
  ```

  Update JSX references the same way.

- [ ] **Step 3: Verify both pages load**

  - Open `http://localhost:3000/lobbyists` — list loads, search works
  - Open `http://localhost:3000/principals` — list loads, filters work

- [ ] **Step 4: Commit**

  ```bash
  git add components/lobbyists/LobbyistsList.js components/principals/PrincipalsList.js
  git commit -m "LobbyistsList + PrincipalsList: fetch from API routes"
  ```

---

## Task 10: Full Verification

- [ ] **Step 1: Check all 5 directory pages**

  With `npm run dev` running, open each page and verify:

  | Page | URL | Check |
  |---|---|---|
  | Donors | `/donors` | Table loads, search for "Florida Power" returns FPL |
  | Candidates | `/candidates` | Table loads, filter by party REP works |
  | Committees | `/committees` | Table loads, search for "Republican" works |
  | Lobbyists | `/lobbyists` | Table loads, "Has Donation Match" filter works |
  | Principals | `/principals` | Table loads, industry filter works |

- [ ] **Step 2: Verify profile pages still work**

  Profile pages still read from JSON files — confirm they didn't break:
  - `/donor/florida-power-light-company` — loads
  - `/candidate/37737` — loads
  - `/lobbyists` → click any lobbyist → profile loads

- [ ] **Step 3: Final commit**

  ```bash
  git add -A
  git commit -m "Phase 2 complete: all directory pages query Supabase via API routes"
  ```

---

## What's Next (Phase 3)

Profile pages still read from JSON files via `lib/loadDonor.js`, `lib/loadCandidate.js`, etc. Phase 3 will:
- Rewrite those lib files to query Supabase directly
- Remove the `public/data/` JSON files
- Speed up deploys (no more 59K static pages to build)
