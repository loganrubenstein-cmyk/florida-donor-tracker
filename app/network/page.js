import Link from 'next/link';

export const metadata = {
  title: 'Network — Florida Donor Tracker',
  description: 'Network graph, money flow, and connection explorer for Florida campaign finance.',
};

export default function NetworkHub() {
  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Network</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
        Network
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Tools for exploring relationships between donors, committees, candidates, and lobbyists.
      </p>

      <div className="hub-grid">
        <Link href="/network/graph" className="hub-card">
          <div className="hub-card-title">Network Graph</div>
          <div className="hub-card-desc">Interactive force-directed graph showing donor-committee-candidate relationships. Search for any entity to center the graph.</div>
          <div className="hub-card-stat">Force-directed · interactive</div>
        </Link>

        <Link href="/flow" className="hub-card">
          <div className="hub-card-title">Money Flow</div>
          <div className="hub-card-desc">Sankey diagram of aggregate money movement between donor types and recipient committees and candidates.</div>
        </Link>

        <Link href="/connections" className="hub-card">
          <div className="hub-card-title">Connections</div>
          <div className="hub-card-desc">Explore shared donors between committees — find which PACs and candidates draw from the same funding networks.</div>
        </Link>
      </div>
    </main>
  );
}
