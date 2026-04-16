'use client';

import Link from 'next/link';
import { fmtMoneyCompact } from '@/lib/fmt';
import { INDUSTRY_COLORS } from '@/lib/industryColors';

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };

const LEVEL_LABELS = {
  industries: 'Industries',
  donors: 'Top Candidates',
  topdonors: 'Top Donors',
  committees: 'Committees Funded',
  candidates: 'Linked Candidates',
};

function SkeletonRows() {
  return (
    <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {[100, 80, 65, 85, 55].map((w, i) => (
        <div key={i} className="skeleton-row" style={{ height: '28px', width: `${w}%` }} />
      ))}
    </div>
  );
}

function getKey(item, level) {
  if (level === 'industries') return item.industry;
  if (level === 'donors')     return item.slug;
  if (level === 'topdonors')  return item.slug;
  if (level === 'committees') return item.acct_num;
  if (level === 'candidates') return item.acct_num;
  return null;
}

const rowBase = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  width: '100%', textAlign: 'left', border: 'none',
  padding: '0.45rem 0.75rem', cursor: 'pointer',
  transition: 'background 0.1s',
};

export default function ColumnPanel({ col, onSelect }) {
  const { level, data, loading, selectedKey } = col;

  function renderItem(item) {
    const key = getKey(item, level);
    const isSelected = key !== null && key === selectedKey;

    const selStyle = {
      background: isSelected ? 'rgba(255,176,96,0.1)' : 'transparent',
      borderLeft: isSelected ? '2px solid var(--orange)' : '2px solid transparent',
    };

    if (level === 'industries') {
      const color = INDUSTRY_COLORS[item.industry] || '#666688';
      return (
        <button key={item.industry}
          onClick={() => onSelect(item, key)}
          style={{ ...rowBase, ...selStyle }}
          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(100,140,220,0.07)'; }}
          onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.73rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.industry}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
              {fmtMoneyCompact(item.total)}
            </span>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>
              {item.donor_count.toLocaleString()} donors
            </span>
          </div>
        </button>
      );
    }

    if (level === 'donors') {
      const partyColor = item.party === 'REP' ? 'var(--republican)' : item.party === 'DEM' ? 'var(--democrat)' : null;
      return (
        <button key={item.slug}
          onClick={() => onSelect(item, key)}
          style={{ ...rowBase, ...selStyle, flexDirection: 'column', alignItems: 'flex-start' }}
          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(100,140,220,0.07)'; }}
          onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
          <div style={{ display: 'flex', width: '100%', alignItems: 'baseline', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.73rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {item.name}
            </span>
            {partyColor && (
              <span style={{ fontSize: '0.6rem', color: partyColor, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {item.party === 'REP' ? 'R' : 'D'}
              </span>
            )}
            <span style={{ fontSize: '0.65rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {fmtMoneyCompact(item.total)}
            </span>
          </div>
          {item._isCandidateRow && item.office && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.05rem' }}>
              {[item.office, item.year].filter(Boolean).join(' · ')}
            </div>
          )}
        </button>
      );
    }

    if (level === 'topdonors') {
      return (
        <Link key={item.slug} href={`/donor/${item.slug}`}
          style={{
            ...rowBase, ...selStyle,
            textDecoration: 'none',
          }}
          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(100,140,220,0.07)'; }}
          onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
          <span style={{ fontSize: '0.73rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {item.name}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.5rem' }}>
            {fmtMoneyCompact(item.total)}
          </span>
        </Link>
      );
    }

    if (level === 'committees') {
      return (
        <button key={item.acct_num}
          onClick={() => onSelect(item, key)}
          style={{ ...rowBase, ...selStyle }}
          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(100,140,220,0.07)'; }}
          onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
          <span style={{ fontSize: '0.73rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
            {item.committee_name}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.5rem' }}>
            {fmtMoneyCompact(item.total_amount)}
          </span>
        </button>
      );
    }

    if (level === 'candidates') {
      const partyColor = PARTY_COLOR[item.party] || 'var(--text-dim)';
      const partyLabel = item.party === 'REP' ? 'R' : item.party === 'DEM' ? 'D' : (item.party || '');
      return (
        <Link key={item.acct_num} href={`/candidate/${item.acct_num}`}
          style={{
            ...rowBase, ...selStyle,
            textDecoration: 'none', flexDirection: 'column', alignItems: 'flex-start',
          }}
          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(100,140,220,0.07)'; }}
          onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', width: '100%' }}>
            <span style={{ fontSize: '0.73rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {item.name}
            </span>
            {partyLabel && (
              <span style={{ fontSize: '0.6rem', color: partyColor, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {partyLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.05rem' }}>
            {[item.office, item.year].filter(Boolean).join(' · ')}
          </div>
        </Link>
      );
    }

    return null;
  }

  return (
    <div className="column-panel">
      {/* Sticky column header */}
      <div style={{
        padding: '0.45rem 0.75rem', borderBottom: '1px solid var(--border)',
        fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
        position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{LEVEL_LABELS[level] || level}</span>
        {!loading && data.length > 0 && (
          <span style={{ opacity: 0.5 }}>{data.length}</span>
        )}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : data.length === 0 ? (
        <div style={{ padding: '0.75rem', fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
          None found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.map(item => renderItem(item))}
        </div>
      )}
    </div>
  );
}
