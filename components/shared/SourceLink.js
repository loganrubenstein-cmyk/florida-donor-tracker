const DOE_URLS = {
  candidate: (id) => `https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${id}`,
  committee: (id) => `https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${id}`,
  donor:     ()   => 'https://dos.fl.gov/elections/candidates-committees/campaign-finance/campaign-finance-database/',
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
        border: '1px solid rgba(77,216,240,0.5)', borderRadius: '3px',
        marginTop: '0.5rem',
      }}
      className="source-link"
    >
      <span style={{ fontSize: '0.72rem' }}>&#x2197;</span>
      {label}
    </a>
  );
}
