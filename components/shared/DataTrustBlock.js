import Link from 'next/link';
import { DATA_LAST_UPDATED } from '@/lib/dataLastUpdated';

/**
 * DataTrustBlock — compact metadata block shown at the bottom of profile pages.
 *
 * Props:
 *   source        string — primary data source label
 *   lastUpdated   string — human-readable freshness note (e.g. "April 2025")
 *   direct        string[] — fields that are directly sourced
 *   normalized    string[] — fields that are normalized
 *   inferred      string[] — fields that are inferred
 *   classified    string[] — fields that are classified
 *   caveats       string[] — specific limitations for this page
 *   sourceUrl     string  — optional link to original filing or registry page
 */
export default function DataTrustBlock({
  source,
  lastUpdated = DATA_LAST_UPDATED,
  direct = [],
  normalized = [],
  inferred = [],
  classified = [],
  caveats = [],
  sourceUrl,
}) {
  const hasFields = direct.length || normalized.length || inferred.length || classified.length;

  return (
    <div className="trust-block">
      <h4>Data Source &amp; Confidence</h4>

      {source && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span className="trust-label">Source</span>
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{source}</a>
          ) : (
            <span>{source}</span>
          )}
          {lastUpdated && (
            <span style={{ color: 'rgba(90,106,136,0.7)', marginLeft: '0.75rem' }}>
              · last updated {lastUpdated}
            </span>
          )}
        </div>
      )}

      {hasFields && (
        <div className="trust-row" style={{ marginTop: '0.5rem' }}>
          {direct.length > 0 && (
            <span>
              <span className="confidence-badge confidence-direct" style={{ marginRight: '0.3rem' }}>direct</span>
              <span style={{ fontSize: '0.75rem' }}>{direct.join(', ')}</span>
            </span>
          )}
          {normalized.length > 0 && (
            <span>
              <span className="confidence-badge confidence-normalized" style={{ marginRight: '0.3rem' }}>normalized</span>
              <span style={{ fontSize: '0.75rem' }}>{normalized.join(', ')}</span>
            </span>
          )}
          {inferred.length > 0 && (
            <span>
              <span className="confidence-badge confidence-inferred" style={{ marginRight: '0.3rem' }}>inferred</span>
              <span style={{ fontSize: '0.75rem' }}>{inferred.join(', ')}</span>
            </span>
          )}
          {classified.length > 0 && (
            <span>
              <span className="confidence-badge confidence-classified" style={{ marginRight: '0.3rem' }}>classified</span>
              <span style={{ fontSize: '0.75rem' }}>{classified.join(', ')}</span>
            </span>
          )}
        </div>
      )}

      {caveats.length > 0 && (
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}

      <div style={{ marginTop: '0.75rem' }}>
        <Link href="/methodology">Full methodology →</Link>
      </div>
    </div>
  );
}
