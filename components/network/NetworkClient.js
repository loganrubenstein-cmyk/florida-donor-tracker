'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DetailPanel from './DetailPanel';

const ForceView = dynamic(() => import('./ForceView'), { ssr: false });

const INDUSTRY_OPTIONS = [
  'Real Estate', 'Healthcare', 'Finance & Insurance', 'Legal',
  'Business & Consulting', 'Agriculture', 'Construction',
  'Political / Lobbying', 'Education', 'Technology / Engineering',
  'Retail & Hospitality', 'Government & Public Service',
];

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function NetworkClientInner({ data, annotations }) {
  // data is guaranteed non-null here
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [selectedNode,   setSelectedNode]   = useState(null);
  const [centeredNodeId, setCenteredNodeId] = useState(null);
  const [search,         setSearch]         = useState('');
  const [industryFilter, setIndustryFilter] = useState(null);

  // Resolve initial node from URL params on mount
  useEffect(() => {
    const acct  = searchParams.get('acct');
    const donor = searchParams.get('donor');
    if (acct) {
      const n = data.nodes.find(node => node.acct_num === acct);
      if (n) { setSelectedNode(n); setCenteredNodeId(n.id); }
    } else if (donor) {
      const norm = donor.toUpperCase();
      const n = data.nodes.find(node => node.label.toUpperCase() === norm);
      if (n) { setSelectedNode(n); setCenteredNodeId(n.id); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
    const params = new URLSearchParams();
    if (node) {
      if (node.acct_num) params.set('acct', node.acct_num);
      else params.set('donor', node.label);
    }
    router.replace(`/network/graph${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
  }, [router]);

  const handleRecenter = useCallback((node) => {
    setCenteredNodeId(node.id);
    setTimeout(() => setCenteredNodeId(null), 700);
  }, []);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (!search.trim()) return;
    const q = search.trim().toUpperCase();
    const match = data.nodes.find(n => n.label.toUpperCase().includes(q));
    if (match) { handleNodeSelect(match); handleRecenter(match); }
  }, [search, data, handleNodeSelect, handleRecenter]);

  return (
    <div className="network-container">

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        padding: '0.6rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,8,24,0.9)',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search donors, PACs, candidates..."
            className="network-search"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
              padding: '0.3rem 0.6rem', borderRadius: '3px', outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '0.3rem 0.7rem', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '3px',
          }}>→</button>
        </form>

        {/* Industry filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
            Industry
          </span>
          <select
            value={industryFilter || ''}
            onChange={e => setIndustryFilter(e.target.value || null)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: industryFilter ? 'var(--teal)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              padding: '0.25rem 0.5rem', borderRadius: '3px', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All industries</option>
            {INDUSTRY_OPTIONS.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          {industryFilter && (
            <button
              onClick={() => setIndustryFilter(null)}
              style={{
                padding: '0.2rem 0.45rem', background: 'transparent',
                border: '1px solid rgba(77,216,240,0.3)', color: 'var(--teal)',
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem', cursor: 'pointer', borderRadius: '3px',
              }}
            >✕</button>
          )}
        </div>

        {/* Legend — shows industry colors when filter active, party legend otherwise */}
        {!industryFilter ? (
          <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.68rem', color: 'var(--text-dim)', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { color: 'var(--republican)', label: 'Republican' },
              { color: 'var(--democrat)', label: 'Democrat' },
              { color: 'var(--orange)', label: 'PAC (unclassified)' },
              { color: '#94a3b8', label: 'Corporate' },
              { color: '#c4b5fd', label: 'Individual' },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                {label}
              </span>
            ))}
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: '0.85rem', opacity: 0.6 }}>
              ● size = total $ flow
            </span>
          </div>
        ) : null}

        <span style={{
          marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)',
          padding: '0.2rem 0.6rem', border: '1px solid var(--border)', borderRadius: '999px',
        }}>
          {fmtCount(data.meta.total_nodes)} nodes · {fmtCount(data.meta.total_edges)} edges
        </span>
        <span style={{ fontSize: '0.58rem', color: 'rgba(90,106,136,0.45)', whiteSpace: 'nowrap' }}>
          Data: FL Division of Elections · Not affiliated with the State of Florida
        </span>
      </div>

      {/* Graph + Panel */}
      <div className="network-wrap">
        <div className="network-graph">
          <ForceView
            data={data}
            selectedNode={selectedNode}
            onNodeSelect={handleNodeSelect}
            centeredNodeId={centeredNodeId}
            industryFilter={industryFilter}
          />
        </div>
        <DetailPanel node={selectedNode} graphData={data} onRecenter={handleRecenter} annotations={annotations} />
      </div>
    </div>
  );
}

export default function NetworkClient() {
  const [data,        setData]        = useState(null);
  const [annotations, setAnnotations] = useState({});
  const [error,       setError]       = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/data/network_graph.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      // Annotations are enrichment — degrade gracefully if missing; graph failure is fatal.
      fetch('/data/research/annotations.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([graph, ann]) => {
        setData(graph);
        setAnnotations(ann?.entities || {});
      })
      .catch(() => setError(true));
  }, []);

  if (error) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
      Failed to load network data.
    </div>
  );

  if (!data) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
      Loading network…
    </div>
  );

  return (
    <Suspense fallback={
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading...
      </div>
    }>
      <NetworkClientInner data={data} annotations={annotations} />
    </Suspense>
  );
}
