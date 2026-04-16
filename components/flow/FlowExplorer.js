'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ColumnPanel from './ColumnPanel';

// ── Entry point config ────────────────────────────────────────────────────────
const ENTRY_POINTS = [
  { key: 'industry',   label: 'Industry',   firstLevel: 'industries',       hint: 'Start from a donor industry' },
  { key: 'party',      label: 'Party',      firstLevel: 'parties',          hint: 'Start from a political party' },
  { key: 'committee',  label: 'Committee',  firstLevel: 'candidates',       hint: 'Search for a PAC or committee', needsSearch: true },
  { key: 'candidate',  label: 'Candidate',  firstLevel: 'topdonors',        hint: 'Search for a candidate',        needsSearch: true },
  { key: 'donor',      label: 'Donor',      firstLevel: 'committees',       hint: 'Search for a donor',            needsSearch: true },
];

// ── Level routing ─────────────────────────────────────────────────────────────
function getNextLevel(currentLevel, item) {
  if (currentLevel === 'industries')      return 'donors';
  if (currentLevel === 'parties')         return 'party_candidates';
  if (currentLevel === 'donors')          return item?._isCandidateRow ? 'topdonors' : 'committees';
  if (currentLevel === 'party_candidates') return 'topdonors';
  if (currentLevel === 'committees')      return 'candidates';
  return null;
}

function getDrillUrl(nextLevel, item) {
  if (nextLevel === 'donors')            return `/api/flow/drill?level=donors&industry=${encodeURIComponent(item.industry)}`;
  if (nextLevel === 'party_candidates')  return `/api/flow/drill?level=party_candidates&party=${encodeURIComponent(item.party)}`;
  if (nextLevel === 'topdonors')         return `/api/flow/drill?level=topdonors&candidate_acct=${encodeURIComponent(item.slug || item.acct_num)}`;
  if (nextLevel === 'committees')        return `/api/flow/drill?level=committees&donor_slug=${encodeURIComponent(item.slug)}`;
  if (nextLevel === 'candidates')        return `/api/flow/drill?level=candidates&committee_acct=${encodeURIComponent(item.acct_num)}`;
  return null;
}

function getItemLabel(item, level) {
  if (level === 'industries')      return item.industry;
  if (level === 'parties')         return item.label;
  if (level === 'donors')          return item.name;
  if (level === 'party_candidates') return item.name;
  if (level === 'committees')      return item.committee_name;
  if (level === 'candidates')      return item.name;
  return '?';
}

// ── Search box with typeahead ─────────────────────────────────────────────────
function SearchBox({ searchType, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const search = useCallback((q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/flow/drill?level=search&type=${searchType}&q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.results || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }, [searchType]);

  useEffect(() => { search(query); }, [query, search]);

  function handlePick(item) {
    setQuery('');
    setResults([]);
    onPick(item);
  }

  const placeholders = { committee: 'e.g. Florida Chamber', candidate: 'e.g. Ron DeSantis', donor: 'e.g. Richard Uihlein' };

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholders[searchType] || 'Search…'}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(8,8,24,0.9)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '0.4rem 0.75rem', borderRadius: '3px',
          fontSize: '0.75rem', fontFamily: 'var(--font-mono)', outline: 'none',
        }}
      />
      {(results.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderTop: 'none', borderRadius: '0 0 3px 3px',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>Searching…</div>}
          {results.map((item, i) => {
            const name = item.name || item.committee_name;
            const sub = item.office ? `${item.office}${item.year ? ` · ${item.year}` : ''}` : null;
            return (
              <button key={i} onClick={() => handlePick(item)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.4rem 0.75rem', background: 'none', border: 'none',
                borderBottom: '1px solid rgba(100,140,220,0.07)', cursor: 'pointer',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(100,140,220,0.07)'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}>
                <div style={{ fontSize: '0.73rem', color: 'var(--text)' }}>{name}</div>
                {sub && <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{sub}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main FlowExplorer ─────────────────────────────────────────────────────────
export default function FlowExplorer() {
  const [entryKey, setEntryKey] = useState('industry');
  const [stack, setStack] = useState([
    { level: 'industries', data: [], loading: true, selectedKey: null, selectedItem: null },
  ]);
  const scrollRef = useRef(null);

  const entryConfig = ENTRY_POINTS.find(e => e.key === entryKey) || ENTRY_POINTS[0];

  // Load first column whenever entry point changes (for non-search entry points)
  useEffect(() => {
    if (entryConfig.needsSearch) {
      setStack([]);
      return;
    }
    setStack([{ level: entryConfig.firstLevel, data: [], loading: true, selectedKey: null, selectedItem: null }]);
    fetch(`/api/flow/drill?level=${entryConfig.firstLevel}`)
      .then(r => r.json())
      .then(json => {
        setStack([{ level: entryConfig.firstLevel, data: json.results || [], loading: false, selectedKey: null, selectedItem: null }]);
      })
      .catch(() => {
        setStack([{ level: entryConfig.firstLevel, data: [], loading: false, selectedKey: null, selectedItem: null }]);
      });
  }, [entryKey]);

  // Called when user picks a search result — immediately start a drill
  function handleSearchPick(item) {
    // For committee start: first column shows "candidates" level (linked to committee)
    // For candidate start: first column shows "topdonors"
    // For donor start: first column shows "committees"
    const firstLevel = entryConfig.firstLevel;
    let url;
    if (entryKey === 'committee') {
      url = `/api/flow/drill?level=candidates&committee_acct=${encodeURIComponent(item.acct_num)}`;
    } else if (entryKey === 'candidate') {
      url = `/api/flow/drill?level=topdonors&candidate_acct=${encodeURIComponent(item.slug || item.acct_num)}`;
    } else if (entryKey === 'donor') {
      url = `/api/flow/drill?level=committees&donor_slug=${encodeURIComponent(item.slug)}`;
    }
    if (!url) return;

    const label = item.name || item.committee_name;
    // Show a single loading column with a header showing what was picked
    setStack([{ level: firstLevel, data: [], loading: true, selectedKey: null, selectedItem: null, headerLabel: label }]);

    fetch(url)
      .then(r => r.json())
      .then(json => {
        setStack([{ level: firstLevel, data: json.results || [], loading: false, selectedKey: null, selectedItem: null, headerLabel: label }]);
      })
      .catch(() => {
        setStack([{ level: firstLevel, data: [], loading: false, selectedKey: null, selectedItem: null }]);
      });
  }

  function handleSelect(colIndex, item) {
    const currentLevel = stack[colIndex].level;
    const nextLevel = getNextLevel(currentLevel, item);

    const itemKey = item
      ? (currentLevel === 'industries' ? item.industry
        : currentLevel === 'parties' ? item.party
        : currentLevel === 'donors' ? item.slug
        : currentLevel === 'party_candidates' ? item.slug
        : currentLevel === 'committees' ? item.acct_num
        : currentLevel === 'candidates' ? item.acct_num
        : null)
      : null;

    const newStack = stack.slice(0, colIndex + 1).map((col, i) =>
      i === colIndex ? { ...col, selectedKey: itemKey, selectedItem: item } : col
    );

    if (!nextLevel || !item) {
      setStack(newStack);
      return;
    }

    newStack.push({ level: nextLevel, data: [], loading: true, selectedKey: null, selectedItem: null });
    setStack(newStack);

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
      }
    }, 60);

    const url = getDrillUrl(nextLevel, item);
    if (!url) return;

    fetch(url)
      .then(r => r.json())
      .then(json => {
        setStack(prev => {
          const updated = [...prev];
          const targetIdx = colIndex + 1;
          if (updated[targetIdx]?.level === nextLevel) {
            updated[targetIdx] = { ...updated[targetIdx], data: json.results || [], loading: false };
          }
          return updated;
        });
      })
      .catch(() => {
        setStack(prev => {
          const updated = [...prev];
          if (updated[colIndex + 1]) {
            updated[colIndex + 1] = { ...updated[colIndex + 1], loading: false };
          }
          return updated;
        });
      });
  }

  // Breadcrumbs
  const breadcrumbs = stack
    .filter(col => col.selectedItem)
    .map(col => ({ label: getItemLabel(col.selectedItem, col.level), level: col.level }));

  function handleBreadcrumbClick(crumbIndex) {
    const colsWithSelection = stack.map((col, i) => ({ col, i })).filter(({ col }) => col.selectedItem);
    if (crumbIndex >= colsWithSelection.length) return;
    const targetColIndex = colsWithSelection[crumbIndex].i;
    setStack(prev => {
      const kept = prev.slice(0, targetColIndex + 2);
      return kept.map((col, i) => {
        if (i === targetColIndex + 1) return { ...col, selectedKey: null, selectedItem: null };
        return col;
      });
    });
  }

  return (
    <div>
      {/* Entry point selector */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', alignSelf: 'center', marginRight: '0.25rem' }}>Start from:</span>
        {ENTRY_POINTS.map(ep => {
          const active = entryKey === ep.key;
          return (
            <button key={ep.key} onClick={() => setEntryKey(ep.key)} style={{
              fontSize: '0.68rem', padding: '0.28rem 0.7rem', borderRadius: '3px', cursor: 'pointer',
              border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
              background: active ? 'rgba(77,216,240,0.1)' : 'transparent',
              color: active ? 'var(--teal)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}>
              {ep.label}
            </button>
          );
        })}
      </div>

      {/* Search box for search-based entry points */}
      {entryConfig.needsSearch && (
        <SearchBox searchType={entryKey} onPick={handleSearchPick} />
      )}

      {/* Breadcrumb trail */}
      <div style={{
        minHeight: '1.8rem', display: 'flex', alignItems: 'center',
        gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.6rem',
        fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
      }}>
        {breadcrumbs.length === 0 ? (
          <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {entryConfig.needsSearch ? entryConfig.hint : `Click a ${entryConfig.label.toLowerCase()} to explore →`}
          </span>
        ) : (
          <>
            <span style={{ color: 'var(--text-dim)', opacity: 0.6 }}>Flow</span>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ color: 'rgba(100,140,220,0.4)' }}>›</span>
                <button
                  onClick={() => handleBreadcrumbClick(i)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem',
                    fontFamily: 'var(--font-mono)', fontSize: '0.68rem', borderRadius: '2px',
                    color: i === breadcrumbs.length - 1 ? 'var(--orange)' : 'var(--text-dim)',
                  }}
                  onMouseOver={e => e.currentTarget.style.color = 'var(--orange)'}
                  onMouseOut={e => e.currentTarget.style.color = i === breadcrumbs.length - 1 ? 'var(--orange)' : 'var(--text-dim)'}
                >
                  {crumb.label.length > 28 ? crumb.label.slice(0, 28) + '…' : crumb.label}
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* Column scroll area */}
      {stack.length > 0 && (
        <div
          ref={scrollRef}
          style={{
            display: 'flex', overflowX: 'auto',
            border: '1px solid var(--border)', borderRadius: '3px',
            background: 'var(--surface)', height: '420px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
          }}
        >
          {stack.map((col, i) => (
            <ColumnPanel
              key={`${col.level}-${i}`}
              col={col}
              onSelect={(item) => handleSelect(i, item)}
            />
          ))}
        </div>
      )}

      {stack.length === 0 && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: '3px', height: '120px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic',
        }}>
          Search above to start exploring
        </div>
      )}

      <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
        Choose a starting point, then drill down column by column to trace where money comes from and goes.
      </div>
    </div>
  );
}
