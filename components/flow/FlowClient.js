'use client';

import { useState, useMemo } from 'react';
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const TOP_OPTIONS   = [20, 30, 50, 100];
const MIN_AMOUNTS   = [
  { label: 'All',   value: 0 },
  { label: '$1M+',  value: 1_000_000 },
  { label: '$5M+',  value: 5_000_000 },
  { label: '$10M+', value: 10_000_000 },
];
const SORT_OPTIONS  = [
  { value: 'amount', label: 'By Amount' },
  { value: 'alpha',  label: 'A → Z' },
  { value: 'count',  label: 'By Contributions' },
];
const NODE_WIDTH  = 12;
const LABEL_MAX   = 30;

const REP_PATTERNS = /REPUBLICAN|DESANTIS|TRUMP|RUBIO|SCOTT|GOP|RPPOF|CONSERVATIVE/i;
const DEM_PATTERNS = /DEMOCRAT|DEMOCRATIC|BIDEN|HARRIS|OBAMA|CLINTON|FORWARD FLORIDA|CHARLIE CRIST/i;

function detectParty(name) {
  if (REP_PATTERNS.test(name)) return 'REP';
  if (DEM_PATTERNS.test(name)) return 'DEM';
  return null;
}

function truncate(s) {
  return s.length > LABEL_MAX ? s.slice(0, LABEL_MAX) + '…' : s;
}

function SankeyNode({ x, y, width, height, payload, typeMap, onFocus }) {
  if (!payload?.name) return null;
  const info        = typeMap[payload.name] || {};
  const isCommittee = info.type === 'committee';
  const party       = info.party;

  let color;
  if (isCommittee) {
    color = party === 'REP' ? 'var(--republican)' : party === 'DEM' ? 'var(--democrat)' : 'var(--teal)';
  } else {
    color = party === 'REP' ? '#f8a0a0' : party === 'DEM' ? '#90bffa' : 'var(--orange)';
  }

  const label  = truncate(payload.name);
  const textX  = isCommittee ? x + width + 8 : x - 8;
  const anchor = isCommittee ? 'start' : 'end';
  const h      = Math.max(height, 2);

  const handleClick = (e) => {
    e.preventDefault();
    if (onFocus) onFocus(payload.name, info);
  };

  return (
    <g onClick={handleClick} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={width} height={h} fill={color} fillOpacity={0.88} rx={2} />
      <text
        x={textX} y={y + h / 2}
        textAnchor={anchor} dominantBaseline="middle"
        fontSize={10} fill={color}
        style={{ fontFamily: 'Courier New, monospace' }}
      >
        {label}
      </text>
    </g>
  );
}

function FlowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isLink = d.source?.name != null;
  return (
    <div style={{
      background: '#080818', border: '1px solid rgba(100,140,220,0.25)',
      padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontFamily: 'Courier New, monospace',
      maxWidth: '280px',
    }}>
      {isLink ? (
        <>
          <div style={{ color: '#c8d8f0', marginBottom: '0.2rem', lineHeight: 1.4 }}>
            {d.source.name} <span style={{ color: '#5a6a88' }}>→</span> {d.target.name}
          </div>
          <div style={{ color: '#ffb060', fontWeight: 700 }}>{fmt(d.value)}</div>
        </>
      ) : (
        <>
          <div style={{ color: '#c8d8f0', marginBottom: '0.2rem' }}>{d.name}</div>
          <div style={{ color: '#ffb060', fontWeight: 700 }}>{fmt(d.value)}</div>
          <div style={{ color: '#5a6a88', fontSize: '0.62rem', marginTop: '0.2rem' }}>click to focus</div>
        </>
      )}
    </div>
  );
}

const btnBase = {
  padding: '0.2rem 0.6rem', fontSize: '0.65rem',
  borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
  transition: 'all 0.1s', background: 'transparent',
};

export default function FlowClient({ flows, flowsByCycle = null, donorIndustries = {} }) {
  const [topN,            setTopN]          = useState(30);
  const [sortBy,          setSortBy]        = useState('amount');
  const [minAmount,       setMinAmount]     = useState(0);
  const [search,          setSearch]        = useState('');
  const [partyFilter,     setPartyFilter]   = useState('all');
  const [industryFilter,  setIndustryFilter] = useState('all');
  const [focusedEntity,   setFocusedEntity] = useState(null); // { name, info }
  const [selectedCycle,   setSelectedCycle] = useState('all');

  // Active flows: per-cycle selection or all-time
  const activeFlows = useMemo(() => {
    if (selectedCycle === 'all' || !flowsByCycle) return flows;
    return flowsByCycle.by_cycle[selectedCycle] || [];
  }, [flows, flowsByCycle, selectedCycle]);

  const cycles = flowsByCycle?.cycles || [];

  // Build sorted industry list from donorIndustries (industries present in the flow set)
  const industries = useMemo(() => {
    const counts = {};
    activeFlows.forEach(f => {
      const ind = donorIndustries[f.donor];
      if (ind && ind !== 'Unclassified') counts[ind] = (counts[ind] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([ind]) => ind);
  }, [activeFlows, donorIndustries]);

  const handleNodeFocus = (name, info) => {
    setFocusedEntity({ name, info });
    setSearch('');
  };

  const clearFocus = () => setFocusedEntity(null);

  const { sankeyData, typeMap, totalFlow, visibleCount } = useMemo(() => {
    const q = search.trim().toLowerCase();

    let filtered;

    if (focusedEntity) {
      // Show ALL flows involving this entity (ignore topN, minAmount, partyFilter, search)
      const n = focusedEntity.name;
      filtered = activeFlows.filter(f => f.donor === n || f.committee === n);
    } else {
      filtered = activeFlows.filter(f => {
        if (f.total_amount < minAmount) return false;
        if (q && !f.donor.toLowerCase().includes(q) && !f.committee.toLowerCase().includes(q)) return false;
        if (partyFilter !== 'all') {
          const donorParty     = detectParty(f.donor);
          const committeeParty = detectParty(f.committee);
          if (partyFilter === 'REP' && donorParty !== 'REP' && committeeParty !== 'REP') return false;
          if (partyFilter === 'DEM' && donorParty !== 'DEM' && committeeParty !== 'DEM') return false;
        }
        if (industryFilter !== 'all') {
          const ind = donorIndustries[f.donor] || 'Unclassified';
          if (ind !== industryFilter) return false;
        }
        return true;
      });

      if (sortBy === 'alpha') filtered.sort((a, b) => a.donor.localeCompare(b.donor));
      if (sortBy === 'count') filtered.sort((a, b) => b.num_contributions - a.num_contributions);
    }

    const top = focusedEntity ? filtered : filtered.slice(0, topN);

    const typeMap = {};
    top.forEach(f => {
      if (!typeMap[f.donor])  typeMap[f.donor]    = { type: 'donor',     slug: slugify(f.donor),  party: detectParty(f.donor) };
      typeMap[f.committee]                         = { type: 'committee', acct: f.committee_acct,  party: detectParty(f.committee) };
    });

    const donorNames     = [...new Set(top.map(f => f.donor))];
    const committeeNames = [...new Set(top.map(f => f.committee))];
    const nodes          = [
      ...donorNames.map(name => ({ name })),
      ...committeeNames.map(name => ({ name })),
    ];
    const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n.name, i]));

    const links = top.map(f => ({
      source: nodeIdx[f.donor],
      target: nodeIdx[f.committee],
      value:  f.total_amount,
    }));

    const totalFlow    = top.reduce((s, f) => s + f.total_amount, 0);
    const visibleCount = filtered.length;

    return { sankeyData: { nodes, links }, typeMap, totalFlow, visibleCount };
  }, [activeFlows, topN, sortBy, minAmount, search, partyFilter, industryFilter, donorIndustries, focusedEntity]);

  const nodeCount   = sankeyData.nodes.length;
  const chartHeight = Math.max(520, nodeCount * 24);

  const renderNode = useMemo(
    () => (props) => <SankeyNode {...props} typeMap={typeMap} onFocus={handleNodeFocus} />,
    [typeMap]
  );

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.3rem 0.6rem',
    fontSize: '0.65rem', borderRadius: '2px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const focusInfo = focusedEntity?.info || {};
  const focusProfileHref = focusInfo.acct
    ? `/committee/${focusInfo.acct}`
    : focusInfo.slug ? `/donor/${focusInfo.slug}` : null;

  // Compute stats for focused entity
  const focusStats = useMemo(() => {
    if (!focusedEntity) return null;
    const n = focusedEntity.name;
    const asCommittee = activeFlows.filter(f => f.committee === n);
    const asDonor     = activeFlows.filter(f => f.donor === n);
    const totalIn     = asCommittee.reduce((s, f) => s + f.total_amount, 0);
    const totalOut    = asDonor.reduce((s, f) => s + f.total_amount, 0);
    return { asCommittee, asDonor, totalIn, totalOut };
  }, [focusedEntity, activeFlows]);

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--orange)', color: 'var(--orange)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            MONEY FLOW
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          Donor → Committee Flow
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>
            {focusedEntity
              ? `${sankeyData.nodes.length} entities · ${visibleCount} flows for ${focusedEntity.name}`
              : `Showing ${Math.min(topN, visibleCount)} of ${visibleCount} matching flows · ${sankeyData.nodes.length} entities`}
          </span>
          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{fmt(totalFlow)} shown</span>
          {!focusedEntity && <span>{activeFlows.length} total flows in dataset</span>}
          {selectedCycle !== 'all' && (
            <span style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
              {selectedCycle} election cycle
            </span>
          )}
        </div>
      </div>

      {/* Focused entity banner */}
      {focusedEntity && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          padding: '0.65rem 1rem', marginBottom: '1rem',
          background: 'rgba(77,216,240,0.06)', border: '1px solid rgba(77,216,240,0.3)',
          borderRadius: '4px',
        }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Focused on:
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--teal)', fontWeight: 600 }}>
            {focusedEntity.name}
          </span>
          {focusStats && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {focusStats.totalIn > 0 && `${fmt(focusStats.totalIn)} received`}
              {focusStats.totalIn > 0 && focusStats.totalOut > 0 && ' · '}
              {focusStats.totalOut > 0 && `${fmt(focusStats.totalOut)} donated`}
            </span>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
            {focusProfileHref && (
              <a href={focusProfileHref} style={{
                fontSize: '0.62rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)',
                textDecoration: 'none', padding: '0.2rem 0.5rem',
                border: '1px solid rgba(77,216,240,0.3)', borderRadius: '2px',
              }}>
                view profile →
              </a>
            )}
            <button onClick={clearFocus} style={{
              ...btnBase,
              color: 'var(--text-dim)', border: '1px solid rgba(100,140,220,0.25)',
              fontSize: '0.62rem',
            }}>
              ✕ clear
            </button>
          </div>
        </div>
      )}

      {/* Controls — only shown when not in focus mode */}
      {!focusedEntity && (
        <>
          {/* Cycle selector */}
          {cycles.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center', marginRight: '0.2rem' }}>
                Cycle
              </span>
              {['all', ...cycles].map(c => {
                const active = selectedCycle === c;
                return (
                  <button key={c} onClick={() => { setSelectedCycle(c); setSearch(''); setIndustryFilter('all'); }} style={{
                    ...btnBase,
                    background: active ? 'rgba(77,216,240,0.08)' : 'transparent',
                    color:      active ? 'var(--teal)' : 'var(--text-dim)',
                    border:     `1px solid ${active ? 'var(--teal)' : 'rgba(100,140,220,0.25)'}`,
                    padding: '0.15rem 0.5rem',
                    fontSize: '0.65rem',
                  }}>
                    {c === 'all' ? 'All Time' : c}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Filter by name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, minWidth: '180px', flexGrow: 1 }}
            />

            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Party:</span>
            {[
              { value: 'all', label: 'All' },
              { value: 'REP', label: 'REP', color: 'var(--republican)' },
              { value: 'DEM', label: 'DEM', color: 'var(--democrat)' },
            ].map(({ value, label, color }) => {
              const active = partyFilter === value;
              return (
                <button key={value} onClick={() => setPartyFilter(value)} style={{
                  ...btnBase,
                  background: active ? (color ? `${color}22` : 'rgba(255,176,96,0.15)') : 'transparent',
                  color:      active ? (color || 'var(--orange)')  : 'var(--text-dim)',
                  border:     `1px solid ${active ? (color || 'var(--orange)') : 'rgba(100,140,220,0.25)'}`,
                }}>
                  {label}
                </button>
              );
            })}

            {industries.length > 0 && (
              <>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>Industry:</span>
                <select
                  value={industryFilter}
                  onChange={e => setIndustryFilter(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.65rem',
                    maxWidth: '140px',
                  }}
                >
                  <option value="all">All</option>
                  {industries.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </>
            )}

            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>Min:</span>
            {MIN_AMOUNTS.map(({ label, value }) => {
              const active = minAmount === value;
              return (
                <button key={value} onClick={() => setMinAmount(value)} style={{
                  ...btnBase,
                  background: active ? 'rgba(255,176,96,0.15)' : 'transparent',
                  color:      active ? 'var(--orange)'          : 'var(--text-dim)',
                  border:     `1px solid ${active ? 'var(--orange)' : 'rgba(100,140,220,0.25)'}`,
                }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>Show top:</span>
            {TOP_OPTIONS.map(n => {
              const active = topN === n;
              return (
                <button key={n} onClick={() => setTopN(n)} style={{
                  ...btnBase,
                  background: active ? 'var(--orange)' : 'transparent',
                  color:      active ? '#000'           : 'var(--text-dim)',
                  border:     `1px solid ${active ? 'var(--orange)' : 'rgba(100,140,220,0.25)'}`,
                }}>
                  {n}
                </button>
              );
            })}

            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginLeft: '0.25rem' }}>Sort:</span>
            {SORT_OPTIONS.map(opt => {
              const active = sortBy === opt.value;
              return (
                <button key={opt.value} onClick={() => setSortBy(opt.value)} style={{
                  ...btnBase,
                  background: active ? 'rgba(77,216,240,0.15)' : 'transparent',
                  color:      active ? 'var(--teal)'            : 'var(--text-dim)',
                  border:     `1px solid ${active ? 'var(--teal)' : 'rgba(100,140,220,0.25)'}`,
                }}>
                  {opt.label}
                </button>
              );
            })}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { color: 'var(--orange)',     label: 'Donor' },
                { color: 'var(--teal)',       label: 'Committee' },
                { color: 'var(--republican)', label: 'Republican-linked' },
                { color: 'var(--democrat)',   label: 'Democrat-linked' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', background: color, borderRadius: '2px', opacity: 0.85 }} />
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Hint text */}
      {!focusedEntity && (
        <div style={{ fontSize: '0.58rem', color: 'rgba(90,106,136,0.6)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
          Click any node to focus on that entity's flows
        </div>
      )}

      {/* Empty state */}
      {sankeyData.nodes.length === 0 && (
        <div style={{
          padding: '3rem', textAlign: 'center',
          color: 'var(--text-dim)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
          border: '1px solid var(--border)', borderRadius: '4px',
        }}>
          No flows match the current filters
        </div>
      )}

      {/* Sankey */}
      {sankeyData.nodes.length > 0 && (
        <div style={{ width: '100%', height: `${chartHeight}px` }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <Sankey
              data={sankeyData}
              node={renderNode}
              nodeWidth={NODE_WIDTH}
              nodePadding={10}
              margin={{ top: 10, right: 220, bottom: 10, left: 220 }}
              link={{
                stroke:      'rgba(100,140,220,0.15)',
                fill:        'rgba(100,140,220,0.12)',
                strokeWidth: 0,
              }}
            >
              <Tooltip content={<FlowTooltip />} />
            </Sankey>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Filings"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
          lastUpdated="April 2026"
          direct={['donor name', 'committee name', 'contribution amounts', 'contribution counts']}
          normalized={['flows aggregated by donor → committee pair across all years']}
          inferred={['party color derived from name pattern matching — not an official classification']}
          caveats={[
            'Shows top donor-to-committee flows only. Flows below the cutoff are not displayed.',
            'Party detection uses keyword matching on names — some assignments may be incorrect.',
            'Dollar amounts are cumulative across all election cycles in the dataset.',
          ]}
        />
      </div>
    </main>
  );
}
