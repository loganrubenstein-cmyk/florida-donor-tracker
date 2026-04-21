'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoneyCompact, fmtMoney } from '@/lib/fmt';

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)', I: 'var(--orange)', NPA: 'var(--text-dim)' };

const OFFICE_ORDER = [
  'Governor',
  'Attorney General',
  'Chief Financial Officer',
  'Commissioner of Agriculture',
  'State Senate',
  'State House',
  'Other',
];

function officeGroup(office_desc) {
  if (!office_desc) return 'Other';
  const o = office_desc.trim();
  if (/governor/i.test(o))         return 'Governor';
  if (/attorney general/i.test(o)) return 'Attorney General';
  if (/chief financial/i.test(o))  return 'Chief Financial Officer';
  if (/commissioner.*agri/i.test(o)) return 'Commissioner of Agriculture';
  if (/state senate|fl senate|florida senate/i.test(o)) return 'State Senate';
  if (/state house|fl house|florida house|house of rep/i.test(o)) return 'State House';
  return 'Other';
}

export default function Races2026Page() {
  const [raw,        setRaw]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeGroup, setActiveGroup] = useState('All');

  useEffect(() => {
    fetch('/api/candidates?year=2026&sort=total_combined&page=1')
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        const guard = json.data ? json : { data: [] };
        setRaw(guard.data || []);
      })
      .catch(() => setError('Failed to load — try refreshing'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = {};
  for (const c of raw) {
    const g = officeGroup(c.office_desc);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(c);
  }

  const groups = OFFICE_ORDER.filter(g => grouped[g]?.length > 0);
  const allGroups = ['All', ...groups];
  const display = activeGroup === 'All' ? raw : (grouped[activeGroup] || []);

  const topRaiser = raw.length > 0 ? raw[0] : null;
  const totalRaised = raw.reduce((s, c) => s + (parseFloat(c.total_combined) || 0), 0);

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 2.5rem 5rem' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>2026 Money Race</span>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3rem', alignItems: 'start', marginBottom: '2.5rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(77,216,240,0.3)',
            background: 'rgba(77,216,240,0.06)', color: 'var(--teal)',
          }}>
            2026 Election Cycle
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.75rem' }}>
            The <span style={{ color: 'var(--teal)' }}>money race</span> for Florida 2026
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '520px' }}>
            Fundraising totals for every Florida 2026 candidate — ranked by money raised. Updated as filings are processed. Hard money only (direct campaign contributions).
          </p>
        </div>
        {!loading && raw.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem 1.5rem', background: 'var(--surface)', minWidth: '200px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Cycle snapshot</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { val: fmtMoneyCompact(totalRaised), label: 'total raised' },
                { val: raw.length,                   label: 'candidates filing' },
                { val: groups.length,                label: 'races tracked' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{s.label}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '2rem 0' }}>Loading race data…</div>
      )}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '3px', color: 'var(--republican)', fontSize: '0.78rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {!loading && raw.length > 0 && (
        <>
          {/* Top money leader */}
          {topRaiser && (
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '0.9rem' }}>
                Money leader
              </div>
              <Link href={`/candidate/${topRaiser.acct_num}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  border: '1px solid rgba(77,216,240,0.2)', background: 'rgba(77,216,240,0.04)',
                  borderRadius: '4px', padding: '1.25rem 1.5rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                      #{1} overall · {officeGroup(topRaiser.office_desc)}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)', marginBottom: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
                      {topRaiser.candidate_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      <span style={{ color: PARTY_COLOR[topRaiser.party_code] || 'var(--text-dim)' }}>{topRaiser.party_code}</span>
                      {topRaiser.district && <span style={{ marginLeft: '0.5rem' }}>District {topRaiser.district}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMoneyCompact(parseFloat(topRaiser.total_combined))}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>total raised</div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
            {allGroups.map(g => (
              <button key={g} onClick={() => setActiveGroup(g)}
                style={{
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${activeGroup === g ? 'var(--teal)' : 'transparent'}`,
                  color: activeGroup === g ? 'var(--teal)' : 'var(--text-dim)',
                  fontSize: '0.71rem', padding: '0.5rem 1rem 0.55rem',
                  cursor: 'pointer', marginBottom: '-1px', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)', transition: 'color 0.12s',
                }}>
                {g}
                {g !== 'All' && grouped[g] && (
                  <span style={{ marginLeft: '0.35rem', opacity: 0.5, fontSize: '0.62rem' }}>
                    {grouped[g].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Leaderboard */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2rem 1fr 100px 90px 90px 70px', gap: '0', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', padding: '0.4rem 0.75rem', marginBottom: '0.4rem' }}>
              <span>#</span>
              <span>Candidate</span>
              <span style={{ textAlign: 'right' }}>Total</span>
              <span style={{ textAlign: 'right' }}>Hard $</span>
              <span style={{ textAlign: 'right' }}>Soft $</span>
              <span style={{ textAlign: 'right' }}>Donors</span>
            </div>

            {display.slice(0, 100).map((c, i) => {
              const total = parseFloat(c.total_combined) || 0;
              const hard  = parseFloat(c.hard_money_total) || 0;
              const soft  = parseFloat(c.soft_money_total) || 0;
              const topInGroup = (activeGroup === 'All' ? raw : display)[0];
              const topVal = parseFloat(topInGroup?.total_combined) || 1;
              const barPct = (total / topVal) * 100;

              return (
                <Link key={c.acct_num} href={`/candidate/${c.acct_num}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2rem 1fr 100px 90px 90px 70px',
                    gap: '0', padding: '0.65rem 0.75rem', position: 'relative',
                    borderBottom: '1px solid rgba(100,140,220,0.07)',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,140,220,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Bar background */}
                    <div style={{ position: 'absolute', left: '2rem', top: 0, bottom: 0, width: `${barPct * 0.6}%`, background: 'var(--teal)', opacity: 0.04, pointerEvents: 'none' }} />

                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', alignSelf: 'center' }}>{i + 1}</span>
                    <div style={{ alignSelf: 'center', overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.candidate_name}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                        <span style={{ color: PARTY_COLOR[c.party_code] || 'var(--text-dim)', marginRight: '0.4rem' }}>{c.party_code}</span>
                        {c.office_desc && <span>{c.office_desc}{c.district ? ` · D${c.district}` : ''}</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: total > 0 ? 'var(--teal)' : 'var(--text-dim)', textAlign: 'right', alignSelf: 'center' }}>
                      {total > 0 ? fmtMoneyCompact(total) : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'right', alignSelf: 'center' }}>
                      {hard > 0 ? fmtMoneyCompact(hard) : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'right', alignSelf: 'center' }}>
                      {soft > 0 ? fmtMoneyCompact(soft) : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'right', alignSelf: 'center' }}>
                      {c.hard_num_contributions > 0 ? c.hard_num_contributions.toLocaleString() : '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {display.length > 100 && (
            <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Showing top 100 of {display.length} candidates. Use{' '}
              <Link href="/candidates" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Candidates directory</Link>
              {' '}for the full list.
            </div>
          )}

          {/* Cross-links */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginTop: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/who-funds" style={{ fontSize: '0.73rem', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.4rem 0.8rem', textDecoration: 'none' }}>
              → Who funds your district
            </Link>
            <Link href="/candidates" style={{ fontSize: '0.73rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.8rem', textDecoration: 'none' }}>
              → Full candidates directory
            </Link>
            <Link href="/cycles" style={{ fontSize: '0.73rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.8rem', textDecoration: 'none' }}>
              → All election cycles
            </Link>
          </div>
        </>
      )}

      {!loading && raw.length === 0 && !error && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          No 2026 filings loaded yet. Check back as the cycle opens.
        </div>
      )}
    </main>
  );
}
