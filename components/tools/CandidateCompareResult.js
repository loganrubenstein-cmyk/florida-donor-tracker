'use client';

import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { INDUSTRY_COLORS } from '@/lib/industryColors';
import useInViewport from '@/lib/useInViewport';

const PARTY_LABEL = { REP: 'Republican', DEM: 'Democrat', NPA: 'No Party', IND: 'Independent', OTH: 'Other' };
const PARTY_COLOR  = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
const TYPE_COLOR   = { individual: 'var(--green)', corporate: 'var(--blue)', committee: 'var(--orange)', unknown: 'var(--text-dim)' };

function fmtCompact(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: '0.75rem', paddingBottom: '0.4rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

// Side-by-side industry breakdown bars for one candidate
function IndustryColumn({ name, industries, accentColor }) {
  const [ref, inView] = useInViewport();
  const maxPct = industries[0]?.pct || 1;

  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: accentColor, fontWeight: 600, marginBottom: '0.6rem', fontFamily: 'var(--font-mono)' }}>
        {name.split(' ')[0]}&rsquo;s money comes from
      </div>
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {industries.map((row, i) => {
          const color = INDUSTRY_COLORS[row.industry] || '#666688';
          const barWidth = maxPct > 0 ? (row.pct / maxPct) * 100 : 0;
          return (
            <div key={row.industry}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.18rem' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                  {row.industry}
                </span>
                <span style={{ fontSize: '0.6rem', color, fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.3rem' }}>
                  {row.pct}%
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: inView ? `${barWidth}%` : '0%',
                  background: color,
                  borderRadius: '2px',
                  transition: `width 0.6s ease-out ${i * 0.04}s`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Unique donors column — donors who gave to one side only
function UniqueDonors({ donors, label, accentColor }) {
  if (!donors.length) {
    return (
      <div>
        <div style={{ fontSize: '0.68rem', color: accentColor, fontWeight: 600, marginBottom: '0.5rem' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>No unique large donors identified.</div>
      </div>
    );
  }
  const maxAmt = donors[0]?.amount || 1;
  return (
    <div>
      <div style={{ fontSize: '0.68rem', color: accentColor, fontWeight: 600, marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {donors.map((d, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${(d.amount / maxAmt) * 100}%`,
              background: TYPE_COLOR[d.type] || '#888', opacity: 0.07,
              borderRadius: '2px',
            }} />
            <div style={{
              position: 'relative', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '0.25rem 0.35rem', gap: '0.5rem',
            }}>
              <Link href={`/donor/${d.slug}`} style={{
                fontSize: '0.72rem', color: 'var(--text)', textDecoration: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {d.name}
              </Link>
              <span style={{ fontSize: '0.68rem', color: accentColor, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {fmtMoney(d.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CandidateCompareResult({ data }) {
  const {
    entity_a, entity_b,
    entity_meta_a: metaA = {}, entity_meta_b: metaB = {},
    industries_a = [], industries_b = [],
    unique_a = [], unique_b = [],
    summary, shared_donors = [],
  } = data;

  const partyA = PARTY_LABEL[metaA.party] || metaA.party || '';
  const partyB = PARTY_LABEL[metaB.party] || metaB.party || '';
  const colorA  = PARTY_COLOR[metaA.party]  || 'var(--orange)';
  const colorB  = PARTY_COLOR[metaB.party]  || 'var(--teal)';

  // Auto-generate contextual insight
  const topIndustryA = industries_a[0]?.industry;
  const topIndustryB = industries_b[0]?.industry;
  let insight = '';
  if (topIndustryA && topIndustryB) {
    if (topIndustryA === topIndustryB) {
      insight = `Both candidates' largest donor industry is ${topIndustryA}.`;
    } else {
      insight = `${entity_a.name.split(' ')[0]}'s biggest funders are in ${topIndustryA}; ${entity_b.name.split(' ')[0]}'s are in ${topIndustryB}.`;
    }
    if (metaA.total_combined > 0 && metaB.total_combined > 0) {
      const ratio = (metaA.total_combined / metaB.total_combined).toFixed(1);
      if (ratio > 1.5) insight += ` ${entity_a.name.split(' ')[0]} raised ${ratio}× more overall.`;
      else if (ratio < 0.67) insight += ` ${entity_b.name.split(' ')[0]} raised ${(1 / ratio).toFixed(1)}× more overall.`;
    }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>

      {/* ── Header: entity summary ─────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1.25rem', marginBottom: '1rem',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center',
      }}>
        {/* Entity A */}
        <div className="slide-from-left" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
            {entity_a.name}
          </div>
          {metaA.total_combined > 0 && (
            <div style={{ fontSize: '1.2rem', color: colorA, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {fmtCompact(metaA.total_combined)}
            </div>
          )}
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
            {[partyA, metaA.office].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>vs.</div>

        {/* Entity B */}
        <div className="slide-from-right" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
            {entity_b.name}
          </div>
          {metaB.total_combined > 0 && (
            <div style={{ fontSize: '1.2rem', color: colorB, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {fmtCompact(metaB.total_combined)}
            </div>
          )}
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
            {[partyB, metaB.office].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* ── Insight callout ────────────────────────────────────────── */}
      {insight && (
        <div style={{
          background: 'rgba(255,176,96,0.06)', border: '1px solid rgba(255,176,96,0.18)',
          borderLeft: '3px solid var(--orange)', borderRadius: '3px',
          padding: '0.75rem 1rem', marginBottom: '1rem',
          fontSize: '0.75rem', color: 'var(--text)', lineHeight: 1.6,
        }}>
          {insight}
        </div>
      )}

      {/* ── Industry breakdown: side by side ──────────────────────── */}
      {(industries_a.length > 0 || industries_b.length > 0) && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem', marginBottom: '1rem',
        }}>
          <SectionLabel>Where their money comes from</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {industries_a.length > 0 && (
              <IndustryColumn name={entity_a.name} industries={industries_a} accentColor={colorA} />
            )}
            {industries_b.length > 0 && (
              <IndustryColumn name={entity_b.name} industries={industries_b} accentColor={colorB} />
            )}
          </div>
        </div>
      )}

      {/* ── Unique donors ─────────────────────────────────────────── */}
      {(unique_a.length > 0 || unique_b.length > 0) && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem', marginBottom: '1rem',
        }}>
          <SectionLabel>Donors backing only one candidate</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <UniqueDonors donors={unique_a} label={`Only funds ${entity_a.name.split(' ')[0]}`} accentColor={colorA} />
            <UniqueDonors donors={unique_b} label={`Only funds ${entity_b.name.split(' ')[0]}`} accentColor={colorB} />
          </div>
        </div>
      )}

      {/* ── Shared donors (donors backing both) ────────────────────── */}
      {shared_donors.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem',
        }}>
          <SectionLabel>Donors backing both ({summary?.overlap_count || shared_donors.length})</SectionLabel>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            {shared_donors.map((d, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                gap: '0.5rem', padding: '0.3rem 0.4rem', fontSize: '0.72rem',
              }}>
                <Link href={`/donor/${d.slug}`} style={{
                  color: 'var(--text)', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {d.name}
                </Link>
                <span style={{ textAlign: 'right', color: colorA, fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                  {fmtMoney(d.amount_a)}
                </span>
                <span style={{ textAlign: 'right', color: colorB, fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                  {fmtMoney(d.amount_b)}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                  {fmtMoney(d.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
