'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { PARTY_COLOR as PARTY_COLOR_MAP } from '@/lib/partyUtils';
import { slugify } from '@/lib/slugify';
const PARTY_COLOR = (p) => PARTY_COLOR_MAP[p] || 'var(--text-dim)';

const VOTE_COLOR = { YES: 'var(--republican)', NO: 'var(--democrat)', YEA: 'var(--republican)', NAY: 'var(--democrat)' };

function ColHeader({ step, total, color }) {
  return (
    <div style={{
      fontSize: '0.58rem', color, textTransform: 'uppercase',
      letterSpacing: '0.12em', fontFamily: 'var(--font-mono)',
      marginBottom: '0.6rem', paddingBottom: '0.4rem',
      borderBottom: `1px solid ${color}33`,
      display: 'flex', justifyContent: 'space-between',
    }}>
      <span>{step}</span>
      {total != null && <span style={{ color: 'var(--text-dim)' }}>{total}</span>}
    </div>
  );
}

function ChainArrow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.9rem', color: 'var(--border)', flexShrink: 0,
      alignSelf: 'center', paddingTop: '1.5rem',
    }}>→</div>
  );
}

export default function FollowExplorer({ preloadSlug }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const timerRef = useRef(null);

  const [donor, setDonor] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [selectedCommittee, setSelectedCommittee] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [votes, setVotes] = useState(null);
  const [principals, setPrincipals] = useState([]);
  const [selectedPrincipal, setSelectedPrincipal] = useState(null);
  const [alignedVotes, setAlignedVotes] = useState(null);
  const [loading, setLoading] = useState({});

  useEffect(() => {
    if (!preloadSlug) return;
    setLoading(l => ({ ...l, committees: true, principals: true }));
    Promise.all([
      fetch(`/api/follow?step=committees&slug=${encodeURIComponent(preloadSlug)}`).then(r => r.json()),
      fetch(`/api/follow?step=principals&donor_slug=${encodeURIComponent(preloadSlug)}`).then(r => r.json()).catch(() => ({ principals: [] })),
    ]).then(([j, p]) => {
      if (j.donor) {
        setQuery(j.donor.name || preloadSlug);
        setDonor(j.donor);
        setCommittees(j.committees || []);
      }
      setPrincipals(p.principals || []);
      setLoading(l => ({ ...l, committees: false, principals: false }));
    }).catch(() => setLoading(l => ({ ...l, committees: false, principals: false })));
  }, [preloadSlug]);

  // Search donors
  function handleSearch(val) {
    setQuery(val);
    clearTimeout(timerRef.current);
    if (val.length < 2) { setSuggestions([]); setShowDrop(false); return; }
    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/follow?step=search&q=${encodeURIComponent(val)}`);
      const j = await res.json();
      setSuggestions(j.results || []);
      setShowDrop(true);
    }, 280);
  }

  async function selectDonor(d) {
    setQuery(d.name);
    setShowDrop(false);
    setSuggestions([]);
    setSelectedCommittee(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setVotes(null);
    setSelectedPrincipal(null);
    setAlignedVotes(null);
    setPrincipals([]);
    setLoading(l => ({ ...l, committees: true, principals: true }));
    const [cRes, pRes] = await Promise.all([
      fetch(`/api/follow?step=committees&slug=${encodeURIComponent(d.slug)}`).then(r => r.json()),
      fetch(`/api/follow?step=principals&donor_slug=${encodeURIComponent(d.slug)}`).then(r => r.json()).catch(() => ({ principals: [] })),
    ]);
    setDonor(cRes.donor);
    setCommittees(cRes.committees || []);
    setPrincipals(pRes.principals || []);
    setLoading(l => ({ ...l, committees: false, principals: false }));
  }

  async function selectPrincipal(p) {
    setSelectedPrincipal(p);
    // If a candidate is already selected, re-fetch aligned votes for the new principal.
    if (selectedCandidate) {
      setLoading(l => ({ ...l, aligned: true }));
      const r = await fetch(
        `/api/follow?step=aligned_votes&candidate_acct=${encodeURIComponent(selectedCandidate.acct_num)}&principal_slug=${encodeURIComponent(p.slug)}`
      );
      setAlignedVotes(await r.json());
      setLoading(l => ({ ...l, aligned: false }));
    }
  }

  async function selectCommittee(c) {
    setSelectedCommittee(c);
    setSelectedCandidate(null);
    setVotes(null);
    setCandidates([]);
    setLoading(l => ({ ...l, candidates: true }));
    const res = await fetch(`/api/follow?step=candidates&acct=${encodeURIComponent(c.acct_num)}`);
    const j = await res.json();
    setCandidates(j.candidates || []);
    setLoading(l => ({ ...l, candidates: false }));
  }

  async function selectCandidate(c) {
    setSelectedCandidate(c);
    setVotes(null);
    setAlignedVotes(null);
    setLoading(l => ({ ...l, votes: true, aligned: !!selectedPrincipal }));
    const votesPromise = fetch(`/api/follow?step=votes&acct=${encodeURIComponent(c.acct_num)}`).then(r => r.json());
    const alignedPromise = selectedPrincipal
      ? fetch(`/api/follow?step=aligned_votes&candidate_acct=${encodeURIComponent(c.acct_num)}&principal_slug=${encodeURIComponent(selectedPrincipal.slug)}`).then(r => r.json())
      : Promise.resolve(null);
    const [v, a] = await Promise.all([votesPromise, alignedPromise]);
    setVotes(v);
    setAlignedVotes(a);
    setLoading(l => ({ ...l, votes: false, aligned: false }));
  }

  const colStyle = {
    flex: 1,
    minWidth: 0,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '0.85rem 0.9rem',
    overflowY: 'auto',
    maxHeight: '480px',
  };

  const rowStyle = (selected) => ({
    padding: '0.45rem 0.5rem',
    borderRadius: '3px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    background: selected ? 'rgba(100,140,220,0.1)' : 'transparent',
    transition: 'background 0.1s',
  });

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: 'relative', maxWidth: '480px', marginBottom: '1.5rem' }}>
        <input
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onBlur={() => setTimeout(() => setShowDrop(false), 180)}
          placeholder="Search a donor — FPL, Disney, Publix…"
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid rgba(100,140,220,0.35)',
            color: 'var(--text)',
            padding: '0.65rem 1rem',
            fontSize: '0.82rem',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {showDrop && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: 'none', borderRadius: '0 0 3px 3px',
          }}>
            {suggestions.map(s => (
              <div
                key={s.slug}
                onMouseDown={() => selectDonor(s)}
                style={{
                  padding: '0.55rem 1rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ color: 'var(--text)' }}>{s.name}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginLeft: '0.75rem' }}>
                  {fmtMoneyCompact(s.total_combined)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggested starters */}
      {!donor && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Try these</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { name: 'Florida Power & Light', slug: 'florida-power-light-company' },
              { name: 'Florida Realtors', slug: 'florida-realtors' },
              { name: 'Disney', slug: 'the-walt-disney-company' },
              { name: 'Publix', slug: 'publix-super-markets-inc' },
            ].map(s => (
              <button
                key={s.slug}
                onClick={() => { setQuery(s.name); selectDonor(s); }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--teal)',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chain columns */}
      {donor && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>

          {/* Donor */}
          <div style={{ ...colStyle, maxWidth: '240px', flexShrink: 0 }}>
            <ColHeader step="Donor" color="var(--green)" />
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.35rem' }}>{donor.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
              {fmtMoneyCompact(donor.total_combined)} total
            </div>
            {donor.industry && <Link href={`/industry/${slugify(donor.industry)}`} style={{ fontSize: '0.68rem', color: 'var(--gold)', textDecoration: 'none', display: 'block' }}>{donor.industry}</Link>}
            <Link href={`/donor/${donor.slug}`} style={{ fontSize: '0.68rem', color: 'var(--orange)', textDecoration: 'none', display: 'block', marginTop: '0.5rem' }}>
              full profile →
            </Link>

            {/* Lobbying alias strip */}
            {(principals.length > 0 || loading.principals) && (
              <div style={{ marginTop: '0.9rem', paddingTop: '0.7rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.56rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                  Lobbies as
                </div>
                {loading.principals ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>…</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {principals.slice(0, 5).map(p => {
                        const isSel = selectedPrincipal?.slug === p.slug;
                        const score = Math.round(p.score);
                        const tier = score >= 95 ? 'high' : score >= 85 ? 'medium' : 'low';
                        const tierColor = tier === 'high' ? 'var(--green)' : tier === 'medium' ? 'var(--gold)' : 'var(--text-dim)';
                        return (
                          <button
                            key={p.slug}
                            onClick={() => selectPrincipal(p)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                              gap: '0.4rem', width: '100%',
                              background: isSel ? 'rgba(77,216,240,0.1)' : 'transparent',
                              border: isSel ? '1px solid var(--teal)' : '1px solid var(--border)',
                              color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                              padding: '0.35rem 0.5rem', borderRadius: '3px',
                              fontFamily: 'inherit',
                            }}
                          >
                            <span style={{ fontSize: '0.7rem', lineHeight: 1.3, flex: 1 }}>{p.name}</span>
                            <span style={{ fontSize: '0.58rem', color: tierColor, fontFamily: 'var(--font-mono)' }} title={`match score ${score}`}>
                              {tier}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                      Lobbyists this donor hires to influence the FL Legislature. Select one to filter the last column to that principal&rsquo;s lobbied bills.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <ChainArrow />

          {/* Committees */}
          <div style={colStyle}>
            <ColHeader step="Committees Funded" total={committees.length} color="var(--orange)" />
            {loading.committees
              ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>Loading…</div>
              : committees.length === 0
                ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>No committee contributions found.</div>
                : committees.map(c => (
                  <div
                    key={c.acct_num}
                    style={rowStyle(selectedCommittee?.acct_num === c.acct_num)}
                    onClick={() => selectCommittee(c)}
                  >
                    <div style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.35 }}>{c.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                      {fmtMoney(c.total)}
                    </div>
                  </div>
                ))
            }
          </div>

          <ChainArrow />

          {/* Candidates */}
          <div style={colStyle}>
            <ColHeader step="Candidates Supported" total={candidates.length || null} color="var(--republican)" />
            {!selectedCommittee
              ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>← Select a committee</div>
              : loading.candidates
                ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>Loading…</div>
                : candidates.length === 0
                  ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>No linked candidates found for this committee.</div>
                  : candidates.map(c => (
                    <div
                      key={c.acct_num}
                      style={rowStyle(selectedCandidate?.acct_num === c.acct_num)}
                      onClick={() => selectCandidate(c)}
                    >
                      <div style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.35 }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                        {c.party && <span style={{ fontSize: '0.65rem', color: PARTY_COLOR(c.party) }}>{c.party}</span>}
                        {c.office && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{c.office}</span>}
                        {c.year && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{c.year}</span>}
                      </div>
                    </div>
                  ))
            }
          </div>

          <ChainArrow />

          {/* Votes (or Aligned Votes when a principal is selected) */}
          <div style={colStyle}>
            {selectedPrincipal ? (
              <>
                <ColHeader
                  step={`Votes on ${selectedPrincipal.name.length > 22 ? selectedPrincipal.name.slice(0, 22) + '…' : selectedPrincipal.name}-lobbied bills`}
                  total={alignedVotes?.aligned_votes?.length ?? null}
                  color="var(--teal)"
                />
                {!selectedCandidate
                  ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>← Select a candidate</div>
                  : loading.aligned
                    ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>Loading…</div>
                    : !alignedVotes
                      ? null
                      : alignedVotes.note
                        ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>{alignedVotes.note}</div>
                        : alignedVotes.aligned_votes.length === 0
                          ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem', lineHeight: 1.55 }}>
                              No overlap — this candidate has no roll-call votes on bills {selectedPrincipal.name} lobbied in the current session.
                            </div>
                          : alignedVotes.aligned_votes.map((v, i) => (
                            <div key={i} style={{ ...rowStyle(false), cursor: 'default' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                                  {v.bill_number}
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: VOTE_COLOR[v.vote?.toUpperCase()] || 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                                  {v.vote}
                                </span>
                              </div>
                              {v.bill_title && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem', lineHeight: 1.4 }}>
                                  {v.bill_title.length > 60 ? v.bill_title.slice(0, 60) + '…' : v.bill_title}
                                </div>
                              )}
                              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                                {v.filing_count} lobby filing{v.filing_count === 1 ? '' : 's'}
                                {v.position && <> · stance: {v.position}</>}
                              </div>
                            </div>
                          ))
                }
              </>
            ) : (
              <>
                <ColHeader step="Key Votes" total={votes?.votes?.length || null} color="var(--green)" />
                {!selectedCandidate
                  ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>← Select a candidate</div>
                  : loading.votes
                    ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>Loading…</div>
                    : !votes
                      ? null
                      : votes.note
                        ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>{votes.note}</div>
                        : votes.votes.length === 0
                          ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem', lineHeight: 1.55 }}>
                              No FL roll-call votes on record for this candidate.
                              {votes.legislator && <> Their legislator profile may still have committee/bill activity: <a href={`/legislator/${votes.legislator.people_id}`} style={{ color: 'var(--teal)' }}>view profile →</a></>}
                            </div>
                          : votes.votes.map((v, i) => (
                            <div key={i} style={{ ...rowStyle(false), cursor: 'default' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                                  {v.bill_number}
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: VOTE_COLOR[v.vote?.toUpperCase()] || 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                                  {v.vote}
                                </span>
                              </div>
                              {v.bill_title && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem', lineHeight: 1.4 }}>
                                  {v.bill_title.length > 60 ? v.bill_title.slice(0, 60) + '…' : v.bill_title}
                                </div>
                              )}
                            </div>
                          ))
                }
                {principals.length > 0 && selectedCandidate && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.7rem', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                    Tip: select a lobbying alias on the left to narrow to votes on bills that principal lobbied.
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
