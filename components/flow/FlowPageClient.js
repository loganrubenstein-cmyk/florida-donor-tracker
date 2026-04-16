'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import FlowExplorer from './FlowExplorer';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const FlowClient = dynamic(() => import('./FlowClient'), { ssr: false });

export default function FlowPageClient({ flows, flowsByCycle, donorIndustries }) {
  const [view, setView] = useState('column');

  const viewToggle = (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
      {[
        { key: 'column', label: 'Column View' },
        { key: 'sankey', label: 'Flow Diagram' },
      ].map(({ key, label }, i) => (
        <button key={key} onClick={() => setView(key)}
          style={{
            padding: '0.35rem 0.85rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
            background: view === key ? 'var(--orange)' : 'transparent',
            color: view === key ? '#000' : 'var(--text-dim)',
            border: 'none', borderRight: i === 0 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
          }}>
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'sankey') {
    return (
      <div>
        {/* Thin toggle bar above Sankey's own full-page layout */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          padding: '0.5rem 2rem', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {viewToggle}
        </div>
        <FlowClient flows={flows} flowsByCycle={flowsByCycle} donorIndustries={donorIndustries} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div>
          <div style={{ marginBottom: '0.4rem' }}>
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
            fontWeight: 400, color: 'var(--text)', marginBottom: '0.35rem', lineHeight: 1.1,
          }}>
            Money Flow Explorer
          </h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Start from an industry, party, committee, candidate, or specific donor — then drill down column by column to trace the full money chain.
          </p>
        </div>
        {viewToggle}
      </div>

      <FlowExplorer />

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Database"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/contributions/"
          direct={['donor names', 'committee names', 'contribution amounts']}
          normalized={['industry classification (AI-assisted)', 'candidate–committee linkage (soft money heuristics)']}
          caveats={[
            'Industry totals include all political giving across all cycles.',
            'Candidate–committee links are inferred from naming patterns and shared registration data.',
          ]}
        />
      </div>
    </div>
  );
}
