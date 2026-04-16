'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { fmtMoneyCompact, fmtCount } from '@/lib/fmt';

export default function IECandidatesTable({ candidates }) {
  const [sortBy, setSortBy] = useState('amount');
  const [expanded, setExpanded] = useState(null);

  const sorted = useMemo(() => {
    return [...candidates].sort((a, b) => {
      if (sortBy === 'amount') return b.total_ie_amount - a.total_ie_amount;
      if (sortBy === 'exp')    return b.num_expenditures - a.num_expenditures;
      if (sortBy === 'comm')   return b.num_committees - a.num_committees;
      return 0;
    });
  }, [candidates, sortBy]);

  const allYears = useMemo(() => (
    [...new Set(candidates.flatMap(c => (c.by_year || []).map(y => y.year)))].sort()
  ), [candidates]);

  function SortBtn({ val, label }) {
    const active = sortBy === val;
    return (
      <button onClick={() => setSortBy(val)} style={{
        fontSize: '0.62rem', padding: '0.2rem 0.6rem', borderRadius: '3px', cursor: 'pointer',
        border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
        background: active ? 'rgba(255,176,96,0.1)' : 'transparent',
        color: active ? 'var(--orange)' : 'var(--text-dim)',
        fontFamily: 'var(--font-mono)', transition: 'all 0.1s',
      }}>
        {label}
      </button>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Sort:</span>
        <SortBtn val="amount" label="by total" />
        <SortBtn val="exp"    label="by expenditures" />
        <SortBtn val="comm"   label="by committees" />
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 110px 90px 80px 75px 140px',
          padding: '0.4rem 0.85rem',
          background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)',
        }}>
          {['Candidate', 'Total IE', 'Expenditures', 'Committees', 'Years', 'Activity'].map(h => (
            <div key={h} style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
          ))}
        </div>

        {sorted.map((c, i) => {
          const minY = c.by_year?.length > 0 ? Math.min(...c.by_year.map(y => y.year)) : null;
          const maxY = c.by_year?.length > 0 ? Math.max(...c.by_year.map(y => y.year)) : null;
          const yearStr = minY && maxY ? (minY === maxY ? String(minY) : `${minY}–${maxY}`) : '—';
          const maxYearAmt = Math.max(...(c.by_year || []).map(y => y.amount), 1);
          const isExpanded = expanded === c.candidate_acct_num;
          const hasComms = c.spending_committees?.length > 0;

          return (
            <div key={c.candidate_acct_num || i}>
              <div
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 110px 90px 80px 75px 140px',
                  padding: '0.5rem 0.85rem',
                  borderBottom: '1px solid rgba(100,140,220,0.07)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  cursor: hasComms ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onClick={() => hasComms && setExpanded(isExpanded ? null : c.candidate_acct_num)}
              >
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                  {hasComms && (
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem', flexShrink: 0, lineHeight: 1 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  )}
                  {c.candidate_acct_num ? (
                    <Link
                      href={`/candidate/${c.candidate_acct_num}`}
                      style={{ fontSize: '0.75rem', color: 'var(--teal)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onClick={e => e.stopPropagation()}
                    >
                      {c.candidate_name}
                    </Link>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.candidate_name}
                    </span>
                  )}
                </div>

                {/* Total */}
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
                  {fmtMoneyCompact(c.total_ie_amount)}
                </div>

                {/* Expenditures */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
                  {fmtCount(c.num_expenditures)}
                </div>

                {/* Committees */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
                  {c.num_committees}
                </div>

                {/* Year range */}
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
                  {yearStr}
                </div>

                {/* Sparkline */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '20px', alignSelf: 'center' }}>
                  {allYears.map(yr => {
                    const yd = c.by_year?.find(y => y.year === yr);
                    const h = yd ? Math.max(3, (yd.amount / maxYearAmt) * 20) : 0;
                    return (
                      <div key={yr} title={yd ? `${yr}: $${Math.round(yd.amount).toLocaleString()}` : String(yr)} style={{
                        flex: 1, height: `${h}px`, minWidth: '4px',
                        background: h > 0 ? 'var(--orange)' : 'rgba(255,255,255,0.05)',
                        borderRadius: '1px', opacity: h > 0 ? 0.75 : 1,
                      }} />
                    );
                  })}
                </div>
              </div>

              {/* Expanded: spending committees */}
              {isExpanded && hasComms && (
                <div style={{
                  borderBottom: '1px solid var(--border)',
                  background: 'rgba(77,216,240,0.03)',
                  padding: '0.6rem 0.85rem 0.6rem 2.2rem',
                }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                    Committees that spent on this candidate
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {c.spending_committees.map(sc => (
                      <div key={sc.acct_num} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Link href={`/committee/${sc.acct_num}`} style={{
                          fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {sc.name}
                        </Link>
                        <span style={{ fontSize: '0.72rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginLeft: '1rem', flexShrink: 0 }}>
                          {fmtMoneyCompact(sc.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
