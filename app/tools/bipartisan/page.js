'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoneyCompact } from '@/lib/fmt';

export default function BipartisanPage() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState(null);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (query.trim().length < 3) { setResults(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/donors?q=${encodeURIComponent(query)}&page=1`)
        .then(r => r.json())
        .then(j => setResults((j.data || []).slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function lookup(slug) {
    setLoading(true); setData(null); setError(null); setResults(null); setQuery('');
    fetch(`/api/bipartisan?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(j => { if (j.error) setError(j.error); else setData(j); })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }

  const grand = data ? Object.values(data.buckets).reduce((s, v) => s + v, 0) : 0;

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.6rem 0.9rem',
    fontSize: '0.82rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Party Cross-Reference</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 400, color: 'var(--text)', marginBottom: '0.5rem' }}>
        Party Cross-Reference
      </h1>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '2rem', maxWidth: '560px' }}>
        Search for a donor to see how their giving breaks down across Republican, Democratic, and nonpartisan recipients.
      </p>

      <div style={{ position: 'relative', maxWidth: '480px', marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Search donor name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
        />
        {results && results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            {results.map(r => (
              <button key={r.slug} onClick={() => lookup(r.slug)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.9rem', background: 'none', border: 'none', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-mono)', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
                {r.name}
                {r.industry && <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem', marginLeft: '0.5rem' }}>{r.industry}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--republican)', fontSize: '0.8rem' }}>{error}</div>}

      {data && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <Link href={`/donor/${data.donor.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '1rem', fontWeight: 600 }}>{data.donor.name}</Link>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginLeft: '0.75rem' }}>
              {fmtMoneyCompact(grand)} total giving identified
            </span>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(100,140,220,0.1)' }}>
              <div style={{ width: `${data.repPct}%`, background: 'var(--republican)' }} />
              <div style={{ width: `${data.demPct}%`, background: 'var(--democrat)' }} />
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--republican)' }}>■ {data.repPct}% Republican ({fmtMoneyCompact(data.buckets.REP)})</span>
              <span style={{ color: 'var(--democrat)' }}>■ {data.demPct}% Democrat ({fmtMoneyCompact(data.buckets.DEM)})</span>
              {data.buckets.NPA > 0 && <span style={{ color: 'var(--text-dim)' }}>■ NPA ({fmtMoneyCompact(data.buckets.NPA)})</span>}
              {data.buckets.unknown > 0 && <span style={{ color: 'var(--text-dim)' }}>■ other ({fmtMoneyCompact(data.buckets.unknown)})</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {[
              { label: 'Republican Recipients', list: data.repRecipients, color: 'var(--republican)' },
              { label: 'Democrat Recipients',   list: data.demRecipients, color: 'var(--democrat)' },
            ].map(({ label, list, color }) => (
              <div key={label}>
                <div style={{ fontSize: '0.62rem', color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>{label}</div>
                {list.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>None identified</div>}
                {list.map(r => (
                  <div key={r.acct_num} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.76rem' }}>
                    <a
                      href={r.type === 'candidate' ? `/candidate/${r.acct_num}` : `/committee/${r.acct_num}`}
                      style={{ color: 'var(--teal)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}
                    >
                      {r.name}
                    </a>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtMoneyCompact(r.total)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
