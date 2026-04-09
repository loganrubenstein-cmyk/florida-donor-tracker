// components/investigations/InvestigationsList.js
// Server component — rendered at build time from annotations.json

import BackLinks from '@/components/BackLinks';

function fmt(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const THEME_COLORS = {
  'republican-machine':    '#f04d4d',
  'desantis-network':      '#f04d4d',
  'corporate-influence':   '#ffb060',
  'dark-money':            '#a04df0',
  'utility-money':         '#4d88f0',
  'trial-lawyers':         '#4dd8f0',
  'tort-reform':           '#4dd8f0',
  'insurance':             '#4dd8f0',
  'real-estate':           '#f0a04d',
  'growth-machine':        '#f0a04d',
  'utilities':             '#4d88f0',
  'PSC':                   '#4d88f0',
  'regulatory-capture':    '#a04df0',
  'ghost-candidates':      '#f04d4d',
  'gaming':                '#7dd87d',
  'ballot-initiative':     '#7dd87d',
  'private-prisons':       '#f04d4d',
  'immigration':           '#f04d4d',
  'pay-to-play':           '#ffb060',
  'cannabis':              '#7dd87d',
  'sugar':                 '#d8c84d',
  'everglades':            '#7dd87d',
  'healthcare':            '#7dd87d',
  'rick-scott':            '#f04d4d',
  'federal-fraud':         '#f04d4d',
  'january-6':             '#f04d4d',
  'labor':                 '#4dd8f0',
  'media-manipulation':    '#a04df0',
  'petition-fraud':        '#f04d4d',
};

const TYPE_COLOR = {
  committee: 'var(--teal)',
  corporate:  'var(--orange)',
};

const INDUSTRY_LABEL = {
  'political-party':       'Political Party',
  'trial-lawyers':         'Trial Lawyers',
  'real-estate':           'Real Estate',
  'utilities':             'Utilities',
  'political-committee':   'Political Committee',
  'healthcare':            'Healthcare',
  'gaming':                'Gaming',
  'retail':                'Retail',
  'private-prisons':       'Private Prisons',
  'cannabis':              'Cannabis',
  'sugar':                 'Agriculture',
};

function ThemePill({ theme }) {
  const color = THEME_COLORS[theme] || 'var(--text-dim)';
  return (
    <span style={{
      fontSize: '0.55rem', padding: '0.15rem 0.45rem',
      border: `1px solid ${color}33`,
      background: `${color}11`,
      color, borderRadius: '2px',
      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
    }}>
      {theme}
    </span>
  );
}

function EntityCard({ entity }) {
  const typeColor = TYPE_COLOR[entity.type] || 'var(--text-dim)';
  const articles  = entity.articles || [];
  const themes    = entity.themes   || [];

  return (
    <div style={{
      border: '1px solid rgba(100,140,220,0.15)',
      borderRadius: '4px',
      padding: '1.25rem',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {/* Header row */}
      <div>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.55rem', padding: '0.1rem 0.4rem',
            border: `1px solid ${typeColor}`, color: typeColor,
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            {entity.type.toUpperCase()}
          </span>
          <span style={{
            fontSize: '0.55rem', padding: '0.1rem 0.4rem',
            border: '1px solid rgba(100,140,220,0.2)', color: 'var(--text-dim)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)',
          }}>
            {INDUSTRY_LABEL[entity.industry] || entity.industry}
          </span>
        </div>

        <a href={entity.page_url} style={{
          color: '#fff', textDecoration: 'none',
          fontFamily: 'var(--font-serif)', fontSize: '1.05rem',
          fontWeight: 400, lineHeight: 1.2,
          display: 'block', marginBottom: '0.3rem',
        }}>
          {entity.canonical_name}
        </a>

        {entity.stat && (
          <div style={{
            fontSize: '0.72rem', color: 'var(--orange)',
            fontFamily: 'var(--font-mono)', fontWeight: 700,
          }}>
            {entity.stat_label}: {entity.stat}
          </div>
        )}
      </div>

      {/* Themes */}
      {themes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {themes.map(t => <ThemePill key={t} theme={t} />)}
        </div>
      )}

      {/* Articles */}
      {articles.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(100,140,220,0.1)', paddingTop: '0.65rem' }}>
          <div style={{
            fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.5rem',
          }}>
            In the News
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {articles.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--teal)', lineHeight: 1.4, marginBottom: '0.15rem' }}>
                  {a.title}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {a.outlet} · {a.date ? a.date.slice(0, 7) : ''}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Link to data page */}
      <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
        <a href={entity.page_url} style={{
          fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
          textDecoration: 'none',
          borderTop: '1px solid rgba(100,140,220,0.08)', paddingTop: '0.5rem',
          display: 'block',
        }}>
          → view in tracker
        </a>
      </div>
    </div>
  );
}

export default function InvestigationsList({ entities }) {
  // Sort by stat descending (biggest first)
  const sorted = [...entities].sort((a, b) => (b.stat_raw || 0) - (a.stat_raw || 0));

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--orange)', color: 'var(--orange)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            INVESTIGATIONS
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.6rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.5rem', lineHeight: 1.1,
        }}>
          Follow the Story
        </h1>
        <p style={{
          fontSize: '0.75rem', color: 'var(--text-dim)', maxWidth: '560px', lineHeight: 1.8,
        }}>
          {entities.length} entities with documented political influence — cross-referenced with investigative journalism.
          Data from the Florida Division of Elections. Stories from independent reporters.
        </p>
      </div>

      {/* Stats strip */}
      <div style={{
        display: 'flex', gap: '2rem', flexWrap: 'wrap',
        padding: '1rem 0', borderBottom: '1px solid rgba(100,140,220,0.1)',
        marginBottom: '2rem',
      }}>
        {[
          { label: 'Entities tracked', value: entities.length },
          { label: 'Committees', value: entities.filter(e => e.type === 'committee').length },
          { label: 'Corporations', value: entities.filter(e => e.type === 'corporate').length },
          { label: 'Journalism sources', value: [...new Set(entities.flatMap(e => (e.articles || []).map(a => a.outlet)))].length },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', fontWeight: 700 }}>
              {value}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '1rem',
      }}>
        {sorted.map(e => <EntityCard key={e.id} entity={e} />)}
      </div>

      {/* Attribution */}
      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2.5rem',
      }}>
        Financial data: Florida Division of Elections · Journalism sources credited per article ·
        Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
