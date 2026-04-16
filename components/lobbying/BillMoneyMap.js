'use client';
import { useEffect, useState } from 'react';
import { fmtMoneyCompact } from '@/lib/fmt';

export default function BillMoneyMap({ billSlug }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch(`/api/bill-money?bill=${encodeURIComponent(billSlug)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [billSlug]);

  if (loading) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', padding: '2rem 0' }}>Loading money map…</div>;
  if (error)   return <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '2rem 0' }}>{error}</div>;
  if (!data)   return null;

  if (!data.num_voters || data.num_voters === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', padding: '2rem 0' }}>No legislative vote data for this bill.</div>;
  }

  const principals = data.principals || [];
  const votes      = data.votes || [];

  const maxTotal = Math.max(...principals.map(p => p.total_donated_to_yes + p.total_donated_to_no), 1);

  const yesVoters = votes.filter(v => v.vote_text === 'Yea' || v.vote_text === 'Yes');
  const noVoters  = votes.filter(v => v.vote_text === 'Nay' || v.vote_text === 'No');

  return (
    <div>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.75rem', padding: '1rem 1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
        <Stat value={data.num_principals} label="Principals lobbied" />
        <Stat value={data.num_voters}     label="Votes recorded" />
        <Stat value={yesVoters.length}    label="Voted yes" color="var(--teal)" />
        <Stat value={noVoters.length}     label="Voted no"  color="var(--republican)" />
      </div>

      {principals.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No principal donation data matched for this bill.</div>
      ) : (
        <>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Showing top {principals.length} principals by total donations to legislators who voted on this bill.
            Teal = donated to yes voters · Red = donated to no voters.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {principals.map((p, i) => {
              const total   = p.total_donated_to_yes + p.total_donated_to_no;
              const yesPct  = total > 0 ? (p.total_donated_to_yes / total * 100).toFixed(0) : 0;
              const noPct   = total > 0 ? (p.total_donated_to_no  / total * 100).toFixed(0) : 0;
              const barWidth = total > 0 ? (total / maxTotal * 100).toFixed(1) : 0;

              return (
                <div key={p.principal_slug || p.principal_name} style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', width: '18px', flexShrink: 0 }}>{i + 1}.</span>
                      {p.principal_slug ? (
                        <a href={`/principal/${p.principal_slug}`} style={{ fontSize: '0.78rem', color: 'var(--teal)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.principal_name}
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.principal_name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.75rem' }}>
                      {p.total_donated_to_yes > 0 && <span style={{ color: 'var(--teal)' }}>↑ {fmtMoneyCompact(p.total_donated_to_yes)}</span>}
                      {p.total_donated_to_no  > 0 && <span style={{ color: 'var(--republican)' }}>↓ {fmtMoneyCompact(p.total_donated_to_no)}</span>}
                      {total === 0 && <span style={{ color: 'var(--text-dim)' }}>no match</span>}
                    </div>
                  </div>

                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', height: '100%', width: `${barWidth}%` }}>
                      {p.total_donated_to_yes > 0 && (
                        <div style={{ flex: yesPct, background: 'var(--teal)', opacity: 0.7 }} />
                      )}
                      {p.total_donated_to_no > 0 && (
                        <div style={{ flex: noPct, background: 'var(--republican)', opacity: 0.7 }} />
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                    {p.num_filings} filing{p.num_filings !== 1 ? 's' : ''}
                    {total > 0 && ` · ${fmtMoneyCompact(total)} total identified`}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1.25rem', fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Donation amounts reflect contributions from donors matched to these principals via lobbyist disclosure cross-reference.
            Totals may undercount — not all principals have matching campaign finance records.
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, color = 'var(--text)' }) {
  return (
    <div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}
