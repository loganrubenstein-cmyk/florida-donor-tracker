'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';

export default function DarkMoneyScoreboard() {
  const [sort, setSort] = useState('least');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/transparency?sort=${sort}&limit=50`)
      .then(r => r.json())
      .then(json => setData(json))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort]);

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: 'var(--orange)', margin: 0 }}>
          Dark Money Scoreboard
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Ranking Florida political committees by transparency — the ratio of identifiable individual donors vs. corporate and PAC money.
        </p>
      </div>

      {/* Sort toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem' }}>
        {[
          { key: 'least', label: 'Least Transparent' },
          { key: 'most', label: 'Most Transparent' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setSort(opt.key)}
            style={{
              padding: '0.5rem 1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
              background: sort === opt.key ? (opt.key === 'least' ? 'var(--republican)' : 'var(--green)') : 'var(--surface)',
              color: sort === opt.key ? '#000' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: opt.key === 'least' ? '3px 0 0 3px' : '0 3px 3px 0',
              cursor: 'pointer',
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {data?.stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem',
        }}>
          <StatCard label="Committees Scored" value={data.stats.total_committees} color="var(--text)" />
          <StatCard label="Avg Transparency" value={`${data.stats.avg_transparency}%`} color="var(--orange)" />
          <StatCard label="Dark Money Total" value={fmtMoneyCompact(data.stats.total_dark_money)} color="var(--republican)" />
          <StatCard label="Traceable Total" value={fmtMoneyCompact(data.stats.total_traceable)} color="var(--green)" />
        </div>
      )}

      {loading && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading scoreboard…</div>}

      {data?.committees && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2.5rem 2fr 1fr 80px 1fr', gap: '0.5rem',
            padding: '0.4rem 0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)',
            borderBottom: '1px solid var(--border)', marginBottom: '0.3rem',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>#</span>
            <span>Committee</span>
            <span style={{ textAlign: 'right' }}>Total Raised</span>
            <span style={{ textAlign: 'center' }}>Score</span>
            <span>Breakdown</span>
          </div>

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.committees.map((c, i) => (
              <ScoreRow key={c.acct_num} committee={c} rank={i + 1} sortMode={sort} />
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div style={{
        marginTop: '1.5rem', padding: '1rem', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '3px',
        fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text)' }}>Methodology:</strong> The transparency score measures what percentage of a committee's
        top donors are identifiable individuals (higher = more transparent). Committees funded primarily by
        corporations and other PACs score lower because the original source of money is harder to trace.
        Only committees with over $50,000 in total fundraising are included. Scores are based on the top
        donors in our database, not every individual contribution.
      </div>
    </div>
  );
}

function ScoreRow({ committee: c, rank, sortMode }) {
  const scoreColor = c.transparency_score > 60 ? 'var(--green)' :
    c.transparency_score > 30 ? 'var(--orange)' : 'var(--republican)';

  const total = c.breakdown.individual + c.breakdown.corporate + c.breakdown.committee + c.breakdown.other;
  const segments = [
    { key: 'individual', amount: c.breakdown.individual, color: '#80ffa0', label: 'Individual' },
    { key: 'corporate', amount: c.breakdown.corporate, color: '#a0c0ff', label: 'Corporate' },
    { key: 'committee', amount: c.breakdown.committee, color: '#ffb060', label: 'Committee' },
  ].filter(s => s.amount > 0);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '2.5rem 2fr 1fr 80px 1fr', gap: '0.5rem',
      padding: '0.45rem 0.5rem', fontSize: '0.72rem', alignItems: 'center',
      borderBottom: '1px solid rgba(100,140,220,0.06)',
    }}>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>{rank}</span>
      <div style={{ overflow: 'hidden' }}>
        <Link href={`/committee/${c.acct_num}`} style={{
          color: 'var(--text)', textDecoration: 'none', fontSize: '0.72rem',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {c.name}
        </Link>
      </div>
      <span style={{ textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
        {fmtMoneyCompact(c.total_received)}
      </span>
      <div style={{ textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '0.15rem 0.4rem', borderRadius: '3px',
          background: `${scoreColor}22`, color: scoreColor,
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
        }}>
          {c.transparency_score}%
        </span>
      </div>
      <div style={{ display: 'flex', height: '10px', borderRadius: '2px', overflow: 'hidden' }}>
        {total > 0 && segments.map(s => (
          <div key={s.key}
            title={`${s.label}: ${fmtMoney(s.amount)} (${Math.round((s.amount / total) * 100)}%)`}
            style={{
              width: `${(s.amount / total) * 100}%`, background: s.color,
              opacity: 0.6, minWidth: s.amount > 0 ? '2px' : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
      padding: '0.75rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)', color }}>{value}</div>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.2rem' }}>{label}</div>
    </div>
  );
}
