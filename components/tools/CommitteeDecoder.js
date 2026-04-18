'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n) { return `${Math.round(n)}%`; }

const TYPE_LABELS = {
  individual: 'Individuals',
  corporate: 'Corporations',
  committee: 'Other Committees',
  unknown: 'Unknown',
};

const TYPE_COLORS = {
  individual: 'var(--teal)',
  corporate: 'var(--orange)',
  committee: 'var(--blue)',
  unknown: 'var(--text-dim)',
};

export default function CommitteeDecoder() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [decode, setDecode] = useState(null);
  const [decoding, setDecoding] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);

  // Auto-decode if ?acct= is in URL; pre-fill if ?q= is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const acct = params.get('acct');
    const q    = params.get('q');
    if (acct) handleDecode(acct);
    else if (q) setQuery(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/decode?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.json())
        .then(json => {
          setResults(json.results || []);
          setShowResults(true);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handleDecode(acctNum) {
    setDecoding(true);
    setShowResults(false);
    fetch(`/api/decode?acct=${acctNum}`)
      .then(r => r.json())
      .then(json => {
        setDecode(json);
        setDecoding(false);
      })
      .catch(() => setDecoding(false));
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '2px solid var(--orange)',
    color: 'var(--text)',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    borderRadius: '3px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    width: '100%',
  };

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/tools', label: 'tools' }]} />

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.15em',
          color: 'var(--orange)', marginBottom: '0.5rem',
        }}>
          investigative tool
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.5rem', lineHeight: 1.2,
        }}>
          Who's Behind This Committee?
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', maxWidth: '600px', lineHeight: 1.6 }}>
          Florida has thousands of political committees with names designed to sound neutral.
          Enter any committee name to decode who actually funds it, which industries back it,
          and which candidates it supports.
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Type a committee name... e.g. 'Citizens' or 'Future' or 'Freedom'"
          value={query}
          onChange={e => { setQuery(e.target.value); setDecode(null); }}
          style={inputStyle}
        />
        {searching && (
          <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
            searching...
          </div>
        )}

        {/* Dropdown results */}
        {showResults && results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0 0 3px 3px',
            maxHeight: '320px', overflowY: 'auto',
          }}>
            {results.map(r => (
              <button
                key={r.acct_num}
                onClick={() => { setQuery(r.committee_name); handleDecode(r.acct_num); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '0.6rem 1rem', border: 'none',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                  fontSize: '0.75rem', fontFamily: 'var(--font-mono)', textAlign: 'left',
                  borderBottom: '1px solid rgba(100,140,220,0.08)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,140,220,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ flex: 1, marginRight: '1rem' }}>{r.committee_name}</span>
                <span style={{ color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                  {fmt(parseFloat(r.total_received))}
                </span>
              </button>
            ))}
          </div>
        )}
        {showResults && results.length === 0 && !searching && query.trim().length >= 2 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0 0 3px 3px',
            padding: '1rem', color: 'var(--text-dim)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
          }}>
            No committees found matching "{query}"
          </div>
        )}
      </div>

      {/* Loading */}
      {decoding && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          Decoding committee...
        </div>
      )}

      {/* Decode results */}
      {decode && decode.committee && <DecodeResult data={decode} />}

      {/* Suggested searches when idle */}
      {!decode && !decoding && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            try these
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {['Citizens for Fiscal', 'Friends of Ron', 'Floridians for', 'Associated Industries', 'Florida Chamber', 'People for Better'].map(s => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                style={{
                  background: 'rgba(100,140,220,0.06)', border: '1px solid var(--border)',
                  color: 'var(--text)', padding: '0.3rem 0.65rem', borderRadius: '2px',
                  fontSize: '0.68rem', fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Database"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/contributions/"
          
          direct={['committee name', 'treasurer', 'chair', 'contributions received', 'expenditures']}
          normalized={['donor industry classifications', 'candidate linkages (PAC-to-candidate edges)']}
          caveats={[
            'Industry classifications are inferred from donor name and occupation — not self-reported.',
            'Single-donor PAC detection uses top-donor percentage of total receipts (80%+ threshold).',
            'Candidate linkages derived from FL DOE Statement of Organization filings and contribution patterns.',
          ]}
        />
      </div>
    </main>
  );
}

function DecodeResult({ data }) {
  const { committee: c, top_donors, donor_type_breakdown, industry_breakdown, flags, candidates, spending } = data;
  const totalReceived = c.total_received || 0;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
      {/* Committee header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '3px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 400, color: 'var(--text)',
              marginBottom: '0.25rem',
            }}>
              {c.name}
            </h2>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {c.type && <span>{c.type}</span>}
              {c.date_start && <span>{c.date_start} — {c.date_end || 'present'}</span>}
              <a href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                full profile →
              </a>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
              {fmt(totalReceived)}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>total raised</div>
          </div>
        </div>

        {/* Leadership */}
        {(c.treasurer || c.chair) && (
          <div style={{
            marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)',
            display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.7rem',
          }}>
            {c.treasurer && (
              <div>
                <span style={{ color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: '0.08em' }}>Treasurer </span>
                <span style={{ color: 'var(--text)' }}>{c.treasurer}</span>
              </div>
            )}
            {c.chair && (
              <div>
                <span style={{ color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: '0.08em' }}>Chair </span>
                <span style={{ color: 'var(--text)' }}>{c.chair}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flags / alerts */}
      {flags.is_single_donor_pac && (
        <div style={{
          background: 'rgba(255,176,96,0.08)', border: '1px solid rgba(255,176,96,0.3)',
          borderRadius: '3px', padding: '0.75rem 1rem', marginBottom: '1.25rem',
          fontSize: '0.75rem', color: 'var(--orange)',
        }}>
          Single-donor PAC — {pct(flags.top_donor_pct)} of all money comes from the top donor:
          <strong style={{ marginLeft: '0.3rem' }}>{top_donors[0]?.name}</strong>
        </div>
      )}

      {/* Two-column grid: donors + industry */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>

        {/* Top Donors */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1rem 1.25rem' }}>
          <h3 style={{
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-dim)', marginBottom: '0.75rem',
          }}>
            Top Donors
          </h3>
          {top_donors.slice(0, 10).map((d, i) => {
            const barWidth = totalReceived > 0 ? (d.amount / totalReceived) * 100 : 0;
            return (
              <div key={i} style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.15rem' }}>
                  <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', overflow: 'hidden', maxWidth: '70%' }}>
                    <a href={d.slug ? `/donor/${d.slug}` : '#'} style={{
                      color: 'var(--teal)', textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {d.name}
                    </a>
                    {d.slug && (
                      <a href={`/follow?donor=${d.slug}`} style={{ fontSize: '0.58rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.6, flexShrink: 0 }}>follow</a>
                    )}
                  </span>
                  <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {fmt(d.amount)}
                  </span>
                </div>
                <div style={{ height: '3px', background: 'rgba(100,140,220,0.1)', borderRadius: '2px' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: `${Math.max(barWidth, 1)}%`,
                    background: TYPE_COLORS[d.type] || 'var(--teal)',
                  }} />
                </div>
              </div>
            );
          })}
          {top_donors.length > 10 && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              + {top_donors.length - 10} more donors
            </div>
          )}
        </div>

        {/* Industry Breakdown */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1rem 1.25rem' }}>
          <h3 style={{
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-dim)', marginBottom: '0.75rem',
          }}>
            Industry Breakdown
          </h3>
          {industry_breakdown.length > 0 ? (
            industry_breakdown.slice(0, 8).map((ind, i) => {
              const indTotal = industry_breakdown.reduce((s, r) => s + r.total, 0);
              const barWidth = indTotal > 0 ? (ind.total / indTotal) * 100 : 0;
              return (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.15rem' }}>
                    <Link href={`/industry/${slugify(ind.industry)}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{ind.industry}</Link>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                      {fmt(ind.total)}
                    </span>
                  </div>
                  <div style={{ height: '3px', background: 'rgba(100,140,220,0.1)', borderRadius: '2px' }}>
                    <div style={{
                      height: '100%', borderRadius: '2px',
                      width: `${Math.max(barWidth, 1)}%`,
                      background: 'var(--blue)',
                    }} />
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              No industry data available for this committee
            </div>
          )}
        </div>
      </div>

      {/* Donor Type Breakdown */}
      {Object.keys(donor_type_breakdown).length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <h3 style={{
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-dim)', marginBottom: '0.75rem',
          }}>
            Where the Money Comes From
          </h3>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: '24px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
            {Object.entries(donor_type_breakdown).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
              const topTotal = Object.values(donor_type_breakdown).reduce((s, v) => s + v, 0);
              const w = topTotal > 0 ? (amount / topTotal) * 100 : 0;
              return (
                <div key={type} style={{
                  width: `${w}%`, background: TYPE_COLORS[type] || 'var(--text-dim)',
                  minWidth: w > 3 ? undefined : '3px',
                }} title={`${TYPE_LABELS[type] || type}: ${fmt(amount)}`} />
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            {Object.entries(donor_type_breakdown).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
              const topTotal = Object.values(donor_type_breakdown).reduce((s, v) => s + v, 0);
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.65rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '1px', background: TYPE_COLORS[type] || 'var(--text-dim)' }} />
                  <span style={{ color: 'var(--text-dim)' }}>{TYPE_LABELS[type] || type}</span>
                  <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                    {fmt(amount)} ({pct(topTotal > 0 ? (amount / topTotal) * 100 : 0)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Linked Candidates */}
      {candidates.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <h3 style={{
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-dim)', marginBottom: '0.75rem',
          }}>
            Linked Candidates
          </h3>
          {candidates.map((cand, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.4rem 0', borderBottom: i < candidates.length - 1 ? '1px solid rgba(100,140,220,0.06)' : 'none',
              fontSize: '0.72rem',
            }}>
              <a href={`/candidate/${cand.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                {cand.name || `Account ${cand.acct_num}`}
              </a>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                {cand.office && <span>{cand.office}</span>}
                {cand.year && <span>{cand.year}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Spending summary */}
      {spending && spending.total_spent > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <h3 style={{
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-dim)', marginBottom: '0.5rem',
          }}>
            Spending
          </h3>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt(spending.total_spent)}</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: '0.4rem' }}>total spent</span>
            </div>
            <div>
              <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{spending.num_expenditures.toLocaleString()}</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: '0.4rem' }}>payments</span>
            </div>
            {totalReceived > 0 && (
              <div>
                <span style={{ color: spending.total_spent > totalReceived ? 'var(--republican)' : 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                  {pct((spending.total_spent / totalReceived) * 100)}
                </span>
                <span style={{ color: 'var(--text-dim)', marginLeft: '0.4rem' }}>of funds spent</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
