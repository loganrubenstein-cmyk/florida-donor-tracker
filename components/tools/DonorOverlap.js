'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import CandidateCompareResult from '@/components/tools/CandidateCompareResult';

const TYPE_COLOR = { individual: 'var(--green)', corporate: 'var(--blue)', committee: 'var(--orange)', unknown: 'var(--text-dim)' };
const TYPE_LABEL = { individual: 'Individual', corporate: 'Corporate', committee: 'Committee/PAC', unknown: 'Other' };

export default function DonorOverlap({ initialEntityA = null, initialEntityB = null }) {
  const [entityA, setEntityA] = useState(initialEntityA);
  const [entityB, setEntityB] = useState(initialEntityB);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('candidate_compare');

  // Auto-run comparison when both entities are pre-loaded from server
  useEffect(() => {
    if (initialEntityA && initialEntityB && !result) {
      handleCompare(initialEntityA, initialEntityB);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(m) {
    setMode(m);
    setResult(null);
  }

  async function handleCompare(a, b) {
    const ea = a || entityA;
    const eb = b || entityB;
    if (!ea || !eb) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = mode === 'candidate_compare'
        ? `/api/overlap?a=${ea.acct_num}&b=${eb.acct_num}&mode=candidate_compare`
        : `/api/overlap?a=${ea.acct_num}&b=${eb.acct_num}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Comparison failed'); return; }
      setResult(json);
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const btnLabel = loading
    ? 'Comparing…'
    : mode === 'candidate_compare' ? 'Compare Candidates' : 'Find Shared Donors';

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Donor Overlap</span>
      </div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: 'var(--orange)', margin: 0 }}>
          Compare
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Pick any two candidates or committees to compare their donors and funding sources.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', marginBottom: '1.5rem', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden', width: 'fit-content' }}>
        {[
          { key: 'overlap', label: 'Shared Donors' },
          { key: 'candidate_compare', label: 'Candidate Comparison' },
        ].map(({ key, label }, i) => (
          <button key={key} onClick={() => switchMode(key)}
            style={{
              padding: '0.38rem 0.9rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
              background: mode === key ? 'var(--orange)' : 'transparent',
              color: mode === key ? '#000' : 'var(--text-dim)',
              border: 'none', borderRight: i === 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="entity-picker-grid">
        <EntityPicker label="Entity A" value={entityA} onChange={setEntityA} initialValue={initialEntityA} />
        <div style={{ padding: '0.5rem 0', color: 'var(--text-dim)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>vs</div>
        <EntityPicker label="Entity B" value={entityB} onChange={setEntityB} initialValue={initialEntityB} />
      </div>

      <button onClick={() => handleCompare()} disabled={loading || !entityA || !entityB}
        style={{
          padding: '0.5rem 1.5rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
          background: (!entityA || !entityB) ? 'var(--surface)' : 'var(--orange)',
          color: (!entityA || !entityB) ? 'var(--text-dim)' : '#000',
          border: '1px solid var(--border)', borderRadius: '3px',
          cursor: (!entityA || !entityB || loading) ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1, marginBottom: '1.5rem',
        }}>
        {btnLabel}
      </button>

      {/* Quick-select pairs */}
      {!result && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Try a comparison
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { a: { acct_num: '79799', name: 'Ron DeSantis (2022)' }, b: { acct_num: '79408', name: 'Charlie Crist (2022)' }, label: 'DeSantis vs Crist' },
              { a: { acct_num: '70275', name: 'Friends of Ron DeSantis' }, b: { acct_num: '68898', name: 'Republican Party of FL' }, label: 'DeSantis PAC vs RPOF' },
              { a: { acct_num: '88746', name: 'Michelle Salzman' }, b: { acct_num: '84844', name: 'Byron Donalds (2026)' }, label: 'Salzman vs Donalds' },
            ].map(pair => (
              <button key={pair.label} onClick={() => { setEntityA(pair.a); setEntityB(pair.b); }}
                style={{
                  padding: '0.25rem 0.6rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                  background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)',
                  borderRadius: '3px', cursor: 'pointer',
                }}>
                {pair.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '3px', color: 'var(--republican)', fontSize: '0.78rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {result && mode === 'candidate_compare' && <CandidateCompareResult data={result} />}
      {result && mode === 'overlap' && <OverlapResult data={result} />}

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Database"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/contributions/"
          
          direct={['donor names', 'contribution amounts', 'entity type']}
          normalized={['donor slug matching (name normalization for cross-entity comparison)']}
          caveats={[
            'Overlap is computed from pre-aggregated top donors per entity — not every individual contribution.',
            'Donor matching uses normalized name slugs. Different legal entities with similar names may merge.',
            'Overlap percentages are relative to top-donor totals, not full fundraising.',
          ]}
        />
      </div>
    </div>
  );
}

function EntityPicker({ label, value, onChange, initialValue = null }) {
  const [query, setQuery] = useState(initialValue?.name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (value?.name) setQuery(value.name);
    else if (!value) setQuery('');
  }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSearch(val) {
    setQuery(val);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/overlap?q=${encodeURIComponent(val.trim())}`);
        const json = await res.json();
        setResults(json.results || []);
        setOpen(true);
      } catch (e) { /* ignore */ }
    }, 300);
  }

  function select(item) {
    onChange(item);
    setQuery(item.name);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      <input
        type="text" value={query} placeholder="Search candidate or committee…"
        onChange={e => { handleSearch(e.target.value); onChange(null); }}
        style={{
          width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
          background: 'var(--surface)', color: 'var(--text)', border: `1px solid ${value ? 'var(--orange)' : 'var(--border)'}`,
          borderRadius: '3px', boxSizing: 'border-box',
        }}
      />
      {value && (
        <div style={{ fontSize: '0.62rem', color: 'var(--orange)', marginTop: '0.2rem' }}>
          {value.type === 'candidate' ? '🏛' : '📋'} {value.detail}
        </div>
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          maxHeight: '250px', overflowY: 'auto', marginTop: '2px',
        }}>
          {results.map((r, i) => (
            <button key={`${r.acct_num}-${i}`} onClick={() => select(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer',
                fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                borderBottom: i < results.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(100,140,220,0.08)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
              <div style={{ fontSize: '0.62rem', color: r.type === 'candidate' ? 'var(--teal)' : 'var(--orange)', marginTop: '0.15rem' }}>
                {r.type} · {r.detail}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OverlapResult({ data }) {
  const { entity_a, entity_b, summary, type_breakdown, shared_donors } = data;
  const hasOverlap = shared_donors.length > 0;
  const maxTotal = hasOverlap ? shared_donors[0].total : 1;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Summary card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1.25rem', marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <EntityLabel entity={entity_a} />
          <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>×</span>
          <EntityLabel entity={entity_b} />
        </div>

        {!hasOverlap ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
            No shared donors found between these entities.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
            <StatBox label="Shared Donors" value={summary.overlap_count} color="var(--orange)" />
            <StatBox label="Overlap Amount" value={fmtMoneyCompact(summary.total_overlap_amount)} color="var(--green)" />
            <StatBox label="Overlap Rate" value={`${Math.max(summary.overlap_pct_a, summary.overlap_pct_b)}%`} color="var(--teal)" />
          </div>
        )}
      </div>

      {hasOverlap && (
        <>
          {/* Venn-style overlap percentages */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem',
          }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
                Overlap as % of {entity_a.name.split(' ').slice(0, 2).join(' ')}'s donors
              </div>
              <div style={{ height: '8px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(summary.overlap_pct_a, 100)}%`, background: 'var(--orange)', borderRadius: '2px' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--orange)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>{summary.overlap_pct_a}%</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
                Overlap as % of {entity_b.name.split(' ').slice(0, 2).join(' ')}'s donors
              </div>
              <div style={{ height: '8px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(summary.overlap_pct_b, 100)}%`, background: 'var(--teal)', borderRadius: '2px' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--teal)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>{summary.overlap_pct_b}%</div>
            </div>
          </div>

          {/* Type breakdown */}
          {Object.keys(type_breakdown).length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
              padding: '1rem', marginBottom: '1rem',
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                Overlap by Donor Type
              </div>
              <div style={{ display: 'flex', height: '16px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                {Object.entries(type_breakdown).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
                  const pct = (amount / summary.total_overlap_amount) * 100;
                  return <div key={type} style={{ width: `${pct}%`, background: TYPE_COLOR[type] || 'var(--text-dim)', opacity: 0.7, minWidth: pct > 0 ? '2px' : 0 }} />;
                })}
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.68rem' }}>
                {Object.entries(type_breakdown).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
                  <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: TYPE_COLOR[type] || 'var(--text-dim)', display: 'inline-block' }} />
                    <span style={{ color: 'var(--text)' }}>{TYPE_LABEL[type] || type}:</span>
                    <span style={{ color: TYPE_COLOR[type] || 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{fmtMoneyCompact(amount)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Shared donors list */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              Shared Donors ({shared_donors.length})
            </div>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem',
              padding: '0.3rem 0.4rem', fontSize: '0.62rem', color: 'var(--text-dim)',
              borderBottom: '1px solid var(--border)', marginBottom: '0.3rem',
            }}>
              <span>Donor</span>
              <span style={{ textAlign: 'right' }}>To {entity_a.name.split(' ')[0]}</span>
              <span style={{ textAlign: 'right' }}>To {entity_b.name.split(' ')[0]}</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {shared_donors.map((d, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${(d.total / maxTotal) * 100}%`,
                    background: TYPE_COLOR[d.type] || '#888', opacity: 0.06,
                    borderRadius: '2px',
                  }} />
                  <div style={{
                    position: 'relative', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    gap: '0.5rem', padding: '0.35rem 0.4rem', fontSize: '0.72rem',
                  }}>
                    <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'baseline', overflow: 'hidden' }}>
                      <Link href={`/donor/${d.slug}`} style={{
                        color: 'var(--text)', textDecoration: 'none', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {d.name}
                      </Link>
                      <Link href={`/follow?donor=${d.slug}`} style={{ fontSize: '0.58rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.6, flexShrink: 0 }}>follow</Link>
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      {fmtMoney(d.amount_a)}
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      {fmtMoney(d.amount_b)}
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      {fmtMoney(d.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EntityLabel({ entity }) {
  const color = entity.type === 'candidate' ? 'var(--teal)' : 'var(--orange)';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>{entity.name}</div>
      <div style={{ fontSize: '0.62rem', color, textTransform: 'uppercase' }}>{entity.type}</div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', color }}>{value}</div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}
