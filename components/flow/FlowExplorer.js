'use client';

import { useState, useEffect, useRef } from 'react';
import ColumnPanel from './ColumnPanel';

const LEVEL_SEQUENCE = ['industries', 'donors', 'topdonors', 'candidates'];

function getNextLevel(currentLevel, item) {
  if (currentLevel === 'industries') return 'donors';
  if (currentLevel === 'donors')     return item?._isCandidateRow ? 'topdonors' : 'committees';
  if (currentLevel === 'committees') return 'candidates';
  return null; // topdonors and candidates are leaves — link out, no drill
}

function getDrillUrl(nextLevel, item) {
  if (nextLevel === 'donors')    return `/api/flow/drill?level=donors&industry=${encodeURIComponent(item.industry)}`;
  if (nextLevel === 'topdonors') return `/api/flow/drill?level=topdonors&candidate_acct=${encodeURIComponent(item.slug)}`;
  if (nextLevel === 'committees') return `/api/flow/drill?level=committees&donor_slug=${encodeURIComponent(item.slug)}`;
  if (nextLevel === 'candidates') return `/api/flow/drill?level=candidates&committee_acct=${encodeURIComponent(item.acct_num)}`;
  return null;
}

function getItemLabel(item, level) {
  if (level === 'industries') return item.industry;
  if (level === 'donors')     return item.name;
  if (level === 'committees') return item.committee_name;
  if (level === 'candidates') return item.name;
  return '?';
}

export default function FlowExplorer() {
  const [stack, setStack] = useState([
    { level: 'industries', data: [], loading: true, selectedKey: null, selectedItem: null },
  ]);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch('/api/flow/drill?level=industries')
      .then(r => r.json())
      .then(json => {
        setStack(prev => [{ ...prev[0], data: json.results || [], loading: false }]);
      })
      .catch(() => {
        setStack(prev => [{ ...prev[0], loading: false }]);
      });
  }, []);

  function handleSelect(colIndex, item) {
    const currentLevel = stack[colIndex].level;
    const nextLevel = getNextLevel(currentLevel, item);

    const itemKey = item
      ? (currentLevel === 'industries' ? item.industry
        : currentLevel === 'donors' ? item.slug
        : currentLevel === 'committees' ? item.acct_num
        : currentLevel === 'candidates' ? item.acct_num
        : null)
      : null;

    // Update selection on current column, truncate everything after
    const newStack = stack.slice(0, colIndex + 1).map((col, i) =>
      i === colIndex ? { ...col, selectedKey: itemKey, selectedItem: item } : col
    );

    if (!nextLevel || !item) {
      setStack(newStack);
      return;
    }

    // Add loading column for next level
    newStack.push({ level: nextLevel, data: [], loading: true, selectedKey: null, selectedItem: null });
    setStack(newStack);

    // Scroll right to reveal new column
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
      }
    }, 60);

    // Fetch next column data
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

  // Breadcrumbs: one entry per column that has a selected item
  const breadcrumbs = stack
    .filter(col => col.selectedItem)
    .map(col => ({ label: getItemLabel(col.selectedItem, col.level), level: col.level }));

  function handleBreadcrumbClick(crumbIndex) {
    // Find which stack column this breadcrumb corresponds to
    const colsWithSelection = stack
      .map((col, i) => ({ col, i }))
      .filter(({ col }) => col.selectedItem);
    if (crumbIndex >= colsWithSelection.length) return;

    const targetColIndex = colsWithSelection[crumbIndex].i;
    // Keep columns 0..targetColIndex (with selections) + the child column at targetColIndex+1 (cleared)
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
      {/* Breadcrumb trail */}
      <div style={{
        minHeight: '1.8rem', display: 'flex', alignItems: 'center',
        gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.6rem',
        fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
      }}>
        {breadcrumbs.length === 0 ? (
          <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Click an industry to explore where its money flows →
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
                    transition: 'color 0.1s',
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

      <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
        Industries → top candidates by industry funding → top donors to that candidate.
        Click any candidate or donor name to open their full profile.
      </div>
    </div>
  );
}
