'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import TrustRibbon from '@/components/shared/TrustRibbon';

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)', I: 'var(--orange)', NPA: 'var(--text-dim)' };
const PARTY_LABEL = { R: 'Republican', D: 'Democrat', I: 'Independent', NPA: 'No Party Affiliation' };
const TYPE_COLOR  = { individual: 'var(--green)', corporate: 'var(--blue)', committee: 'var(--orange)', unknown: 'var(--text-dim)' };
const TYPE_LABEL  = { individual: 'Individual', corporate: 'Corporate', committee: 'Committee / PAC', unknown: 'Other' };

export default function WhoFundsPage() {
  const [chamber,  setChamber]  = useState('House');
  const [district, setDistrict] = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const maxDistrict = chamber === 'Senate' ? 40 : 120;

  // Auto-load from URL params (e.g. /who-funds?chamber=House&district=117)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlChamber  = params.get('chamber');
    const urlDistrict = params.get('district');
    if (urlChamber === 'House' || urlChamber === 'Senate') setChamber(urlChamber);
    if (urlDistrict) {
      setDistrict(urlDistrict);
      const max = (urlChamber === 'Senate') ? 40 : 120;
      const num = parseInt(urlDistrict, 10);
      if (num && num >= 1 && num <= max) {
        (async () => {
          setLoading(true);
          try {
            const res = await fetch(`/api/district?chamber=${urlChamber || 'House'}&district=${num}`);
            const json = await res.json();
            if (res.ok) setData(json);
            else setError(json.error || 'Not found');
          } catch {
            setError('Network error — try again');
          } finally {
            setLoading(false);
          }
        })();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLookup() {
    const num = parseInt(district, 10);
    if (!num || num < 1 || num > maxDistrict) {
      setError(`Enter a district number between 1 and ${maxDistrict}`);
      return;
    }
    // Sync to URL so the lookup can be bookmarked/shared
    try {
      const url = new URL(window.location);
      url.searchParams.set('chamber', chamber);
      url.searchParams.set('district', String(num));
      window.history.replaceState(null, '', url.toString());
    } catch {}
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res  = await fetch(`/api/district?chamber=${chamber}&district=${num}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Not found'); return; }
      setData(json);
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem 2.5rem 5rem' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Who Funds Your District</span>
      </div>

      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '4rem', alignItems: 'start', marginBottom: '3rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(77,216,240,0.3)',
            background: 'rgba(77,216,240,0.06)', color: 'var(--teal)',
          }}>
            Voter Tool
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.9rem' }}>
            Who's <span style={{ color: 'var(--teal)' }}>bankrolling</span> the people<br />who represent you?
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '480px', marginBottom: '1.5rem' }}>
            Enter your FL House or Senate district to see your legislator, their top donors, how the money breaks down by type, and how they vote.
          </p>

          {/* Input */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>Chamber</div>
              <div style={{ display: 'flex' }}>
                {['House', 'Senate'].map(c => (
                  <button key={c} onClick={() => { setChamber(c); setData(null); setError(null); }}
                    style={{
                      padding: '0.5rem 1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                      background: chamber === c ? 'rgba(77,216,240,0.15)' : 'var(--surface)',
                      color: chamber === c ? 'var(--teal)' : 'var(--text-dim)',
                      border: `1px solid ${chamber === c ? 'rgba(77,216,240,0.35)' : 'var(--border)'}`,
                      borderRadius: c === 'House' ? '3px 0 0 3px' : '0 3px 3px 0',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>District (1–{maxDistrict})</div>
              <input
                type="number" min={1} max={maxDistrict} value={district}
                onChange={e => setDistrict(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder={chamber === 'House' ? '1–120' : '1–40'}
                style={{
                  padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: '3px', width: '90px',
                }}
              />
            </div>
            <button onClick={handleLookup} disabled={loading}
              style={{
                padding: '0.5rem 1.5rem', fontSize: '0.8rem', fontFamily: 'var(--font-mono)',
                background: 'rgba(77,216,240,0.12)', color: 'var(--teal)',
                border: '1px solid rgba(77,216,240,0.3)', borderRadius: '3px',
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
                transition: 'all 0.12s',
              }}>
              {loading ? 'Looking up…' : '→ Look up'}
            </button>
          </div>

          {/* Quick picks */}
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {(chamber === 'House' ? [1,10,20,30,40,60,80,100,120] : [1,5,10,20,30,40]).map(n => (
              <button key={n} onClick={() => setDistrict(String(n))}
                style={{
                  padding: '0.18rem 0.45rem', fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                  background: 'transparent', color: 'var(--text-dim)',
                  border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer',
                }}>
                {n}
              </button>
            ))}
          </div>
          <TrustRibbon source="FL Division of Elections · LegiScan vote data" updated="Apr 14, 2026" confidence="normalized" />
        </div>

        {/* Sidebar */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>What you'll see</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
            {[
              'Your legislator — party, district, counties',
              'Top donors ranked by total given',
              'Money breakdown: individuals vs. PACs vs. corporate',
              'How they compare to chamber average',
              'Recent votes and participation rate',
            ].map(s => (
              <div key={s} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--teal)', flexShrink: 0 }}>→</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { val: '883K', label: 'donors in database' },
              { val: '160',  label: 'current legislators' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--teal)' }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '3px', color: 'var(--republican)', fontSize: '0.78rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {data && <WhoFundsResult data={data} />}

      {/* Cross-links */}
      {!data && !loading && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Related tools</div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link href="/races/2026" style={{ fontSize: '0.73rem', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
                → 2026 money race
              </Link>
              <Link href="/legislature" style={{ fontSize: '0.73rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
                → full legislature
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function WhoFundsResult({ data }) {
  const { legislator: leg, top_donors, donor_type_breakdown, comparison, recent_votes } = data;
  const partyColor = PARTY_COLOR[leg.party] || 'var(--text)';
  const topAmount  = top_donors.length > 0 ? top_donors[0].amount : 1;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease-out' }}>
      {/* Header card */}
      <div style={{
        border: `1px solid ${partyColor}44`, background: 'var(--surface)', borderRadius: '4px',
        padding: '1.5rem 1.75rem', marginBottom: '1rem',
        borderLeft: `3px solid ${partyColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              FL {leg.chamber} · District {leg.district}
            </div>
            <h2 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--text)' }}>
              <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--teal)', textDecoration: 'none', borderBottom: `1px solid ${partyColor}55` }}>
                {leg.name}
              </Link>
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
              <span style={{ color: partyColor }}>{PARTY_LABEL[leg.party] || leg.party}</span>
              {leg.leadership && <span style={{ color: 'var(--orange)' }}>{leg.leadership}</span>}
              {leg.counties?.length > 0 && <span style={{ color: 'var(--text-dim)' }}>{leg.counties.join(', ')}</span>}
              {leg.term_limit_year && <span style={{ color: 'var(--text-dim)' }}>Term-limited {leg.term_limit_year}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)', fontWeight: 700 }}>
              {fmtMoneyCompact(leg.total_raised)}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>total raised</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              {comparison.pct_of_avg > 100
                ? <span style={{ color: 'var(--republican)' }}>{comparison.pct_of_avg - 100}% above chamber avg</span>
                : <span style={{ color: 'var(--green)' }}>{100 - comparison.pct_of_avg}% below chamber avg</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* Two-col: donors + type breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Top donors */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.9rem' }}>
            Top Donors
          </div>
          {top_donors.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No donor data available</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {top_donors.slice(0, 12).map((d, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    width: `${(d.amount / topAmount) * 100}%`,
                    background: TYPE_COLOR[d.type] || '#888', opacity: 0.08, borderRadius: '2px',
                  }} />
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0.28rem 0.4rem', fontSize: '0.71rem' }}>
                    <Link href={`/donor/${d.slug}`} style={{ color: 'var(--orange)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                      {d.name}
                    </Link>
                    <span style={{ color: TYPE_COLOR[d.type] || 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', flexShrink: 0 }}>
                      {fmtMoney(d.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Donor type breakdown */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.9rem' }}>
            Money by Source
          </div>
          {Object.keys(donor_type_breakdown).length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No breakdown available</div>
          ) : (
            <DonorTypeBreakdown breakdown={donor_type_breakdown} />
          )}
          {/* Chamber comparison */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
              vs. Chamber Average
            </div>
            {[
              { label: 'This legislator', val: leg.total_raised, color: 'var(--teal)' },
              { label: 'Chamber average', val: comparison.chamber_avg, color: 'var(--text-dim)' },
              { label: 'Chamber median',  val: comparison.chamber_median, color: 'var(--text-dim)' },
            ].map(row => {
              const max = Math.max(leg.total_raised, comparison.chamber_avg) * 1.1 || 1;
              return (
                <div key={row.label} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '0.18rem' }}>
                    <span style={{ color: row.color }}>{row.label}</span>
                    <span style={{ color: row.color, fontFamily: 'var(--font-mono)' }}>{fmtMoneyCompact(row.val)}</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(100,140,220,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(row.val / max) * 100}%`, background: row.color, opacity: row.label === 'This legislator' ? 0.7 : 0.3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Voting record */}
      {recent_votes.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '1.25rem', background: 'var(--surface)', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.9rem' }}>
            Recent Votes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {recent_votes.map((v, i) => {
              const vc = v.vote === 'Yea' ? 'var(--green)' : v.vote === 'Nay' ? 'var(--republican)' : 'var(--text-dim)';
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.28rem 0.4rem', fontSize: '0.71rem', borderBottom: i < recent_votes.length - 1 ? '1px solid rgba(100,140,220,0.06)' : 'none' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%', color: 'var(--text)' }}>
                    <span style={{ color: 'var(--teal)', marginRight: '0.4rem' }}>{v.bill}</span>
                    {v.title}
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ color: vc, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600 }}>{v.vote}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem' }}>{v.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer links */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', paddingTop: '0.5rem' }}>
        <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          → Full legislator profile
        </Link>
        {leg.acct_num && (
          <Link href={`/candidate/${leg.acct_num}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
            → Campaign finance details
          </Link>
        )}
        <Link href="/races/2026" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
          → 2026 money race
        </Link>
      </div>
    </div>
  );
}

function DonorTypeBreakdown({ breakdown }) {
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const types = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amount]) => ({
      type, amount,
      pct: Math.round((amount / total) * 1000) / 10,
      color: TYPE_COLOR[type] || '#888',
      label: TYPE_LABEL[type] || type,
    }));

  return (
    <div>
      <div style={{ display: 'flex', height: '18px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
        {types.map(t => (
          <div key={t.type} style={{ width: `${t.pct}%`, background: t.color, opacity: 0.65, minWidth: t.pct > 0 ? '2px' : 0 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {types.map(t => (
          <div key={t.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: t.color, display: 'inline-block', opacity: 0.7 }} />
              <span style={{ color: 'var(--text)' }}>{t.label}</span>
            </span>
            <span style={{ color: t.color, fontFamily: 'var(--font-mono)' }}>
              {fmtMoneyCompact(t.amount)} <span style={{ opacity: 0.6 }}>({t.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
