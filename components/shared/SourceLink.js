import Link from 'next/link';

const DOE_URLS = {
  candidate: (id) => `https://dos.elections.myflorida.com/candidates/CanDetail.asp?account=${id}`,
  committee: (id) => `https://dos.elections.myflorida.com/committees/ComDetail.asp?account=${id}`,
  donor:     ()   => 'https://dos.elections.myflorida.com/campaign-finance/contributions/',
  lobbyist:  (id) => `https://www.floridalobbyist.gov/LobbyistProfilePage/ProfilePage?id=${id}`,
  principal: (id) => `https://www.floridalobbyist.gov/CompensationReportSearch`,
  firm:      ()   => 'https://www.floridalobbyist.gov/CompensationReportSearch',
};

export default function SourceLink({ type, id }) {
  const urlFn = DOE_URLS[type];
  if (!urlFn) return null;

  const href = urlFn(id);
  const label = type === 'lobbyist' || type === 'principal' || type === 'firm'
    ? 'Verify on FL Lobbyist Registry'
    : 'Verify on FL Division of Elections';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        fontSize: '0.68rem', color: 'var(--teal)',
        textDecoration: 'none', padding: '0.25rem 0.6rem',
        border: '1px solid var(--teal)', borderRadius: '3px',
        marginTop: '0.5rem', opacity: 0.85,
        transition: 'opacity 0.12s',
      }}
      onMouseOver={e => e.currentTarget.style.opacity = 1}
      onMouseOut={e => e.currentTarget.style.opacity = 0.85}
    >
      <span style={{ fontSize: '0.72rem' }}>&#x2197;</span>
      {label}
    </a>
  );
}
