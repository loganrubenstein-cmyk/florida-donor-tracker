// components/investigations/InvestigationsList.js
// Server component — rendered at build time from annotations.json

import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

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
  'bipartisan-giving':     '#ffb060',
  'legislative-battles':   '#ffb060',
  'property-rights':       '#f0a04d',
  'affordable-housing':    '#7dd87d',
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
      fontSize: '0.6rem', padding: '0.18rem 0.5rem',
      border: `1px solid ${color}44`,
      background: `${color}11`,
      color, borderRadius: '2px',
      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
    }}>
      {theme}
    </span>
  );
}

function ArticleCard({ article }) {
  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        padding: '0.75rem',
        background: 'rgba(100,140,220,0.04)',
        border: '1px solid rgba(100,140,220,0.1)',
        borderRadius: '3px',
        transition: 'border-color 0.12s',
      }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--teal)', lineHeight: 1.45,
          marginBottom: '0.3rem', fontWeight: 400,
        }}>
          {article.title}
        </div>
        <div style={{
          fontSize: '0.62rem', color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          display: 'flex', gap: '0.6rem', alignItems: 'center',
        }}>
          <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{article.outlet}</span>
          {article.date && <span>{article.date.slice(0, 7)}</span>}
          <span style={{ marginLeft: 'auto', opacity: 0.5 }}>↗</span>
        </div>
      </div>
    </a>
  );
}

function EntityCard({ entity }) {
  const typeColor = TYPE_COLOR[entity.type] || 'var(--text-dim)';
  const articles  = entity.articles || [];
  const themes    = entity.themes   || [];

  return (
    <div style={{
      border: '1px solid rgba(100,140,220,0.18)',
      borderRadius: '4px',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Card header — accent stripe */}
      <div style={{
        padding: '1.25rem 1.25rem 0',
      }}>
        {/* Type + industry badges */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.58rem', padding: '0.12rem 0.45rem',
            border: `1px solid ${typeColor}`, color: typeColor,
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            {entity.type.toUpperCase()}
          </span>
          <span style={{
            fontSize: '0.58rem', padding: '0.12rem 0.45rem',
            border: '1px solid rgba(100,140,220,0.2)', color: 'var(--text-dim)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)',
          }}>
            {INDUSTRY_LABEL[entity.industry] || entity.industry}
          </span>
        </div>

        {/* Name */}
        <a href={entity.page_url} style={{
          color: '#fff', textDecoration: 'none',
          fontFamily: 'var(--font-serif)', fontSize: '1.15rem',
          fontWeight: 400, lineHeight: 1.2,
          display: 'block', marginBottom: '0.45rem',
        }}>
          {entity.canonical_name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
        </a>

        {/* Stat */}
        {entity.stat && (
          <div style={{
            fontSize: '0.88rem', color: 'var(--orange)',
            fontFamily: 'var(--font-mono)', fontWeight: 700,
            marginBottom: '0.75rem',
          }}>
            {entity.stat_label}: {entity.stat}
          </div>
        )}

        {/* Theme pills */}
        {themes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '1rem' }}>
            {themes.map(t => <ThemePill key={t} theme={t} />)}
          </div>
        )}
      </div>

      {/* Articles section */}
      {articles.length > 0 && (
        <div style={{
          padding: '0 1.25rem 1.25rem',
          flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <div style={{
            fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.25rem',
          }}>
            In the News — {articles.length} article{articles.length !== 1 ? 's' : ''}
          </div>
          {articles.map((a, i) => <ArticleCard key={i} article={a} />)}
        </div>
      )}

      {/* Footer link */}
      <div style={{
        borderTop: '1px solid rgba(100,140,220,0.08)',
        padding: '0.6rem 1.25rem',
      }}>
        <a href={entity.page_url} style={{
          fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
          textDecoration: 'none',
        }}>
          → view in tracker
        </a>
      </div>
    </div>
  );
}

export default function InvestigationsList({ entities }) {
  const sorted = [...entities].sort((a, b) => (b.stat_raw || 0) - (a.stat_raw || 0));
  const totalArticles = entities.reduce((s, e) => s + (e.articles?.length || 0), 0);
  const outlets = [...new Set(entities.flatMap(e => (e.articles || []).map(a => a.outlet)))];

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
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 4vw, 2.8rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.6rem', lineHeight: 1.1,
        }}>
          Follow the Story
        </h1>
        <p style={{
          fontSize: '0.82rem', color: 'var(--text-dim)', maxWidth: '580px', lineHeight: 1.8,
        }}>
          {entities.length} entities with documented political influence — cross-referenced with investigative journalism.
          Data from the Florida Division of Elections. Stories from independent reporters.
        </p>
      </div>

      {/* Stats strip */}
      <div style={{
        display: 'flex', gap: '2.5rem', flexWrap: 'wrap',
        padding: '1rem 0', borderBottom: '1px solid rgba(100,140,220,0.1)',
        marginBottom: '2rem',
      }}>
        {[
          { label: 'Entities tracked',    value: entities.length },
          { label: 'Committees',          value: entities.filter(e => e.type === 'committee').length },
          { label: 'Corporations',        value: entities.filter(e => e.type === 'corporate').length },
          { label: 'Articles linked',     value: totalArticles },
          { label: 'Journalism sources',  value: outlets.length },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', fontWeight: 700 }}>
              {value}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '1.25rem',
      }}>
        {sorted.map(e => <EntityCard key={e.id} entity={e} />)}
      </div>

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="FL Division of Elections (finance) · RSS news feeds (journalism)"
          lastUpdated="April 2026"
          direct={['entity names', 'finance totals', 'article headlines and links']}
          normalized={['entity-to-profile matching (by name/acct_num)']}
          inferred={['political influence signals (editorial judgment, not automated)']}
          caveats={[
            'Entities curated manually — not a comprehensive list of all political actors.',
            'News links sourced from public RSS feeds; content belongs to original publishers.',
            'Finance figures may include cross-cycle amounts — see individual profiles for cycle breakdown.',
          ]}
        />
      </div>
    </main>
  );
}
