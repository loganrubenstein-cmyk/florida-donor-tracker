'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { PARTY_COLOR as PARTY_COLOR_MAP } from '@/lib/partyUtils';
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

export default function FollowExplorer() {
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
  const [loading, setLoading] = useState({});

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
    setLoading(l => ({ ...l, committees: true }));
    const res = await fetch(`/api/follow?step=committees&slug=${encodeURIComponent(d.slug)}`);
    const j = await res.json();
    setDonor(j.donor);
    setCommittees(j.committees || []);
    setLoading(l => ({ ...l, committees: false }));
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
    setLoading(l => ({ ...l, votes: true }));
    const res = await fetch(`/api/follow?step=votes&acct=${encodeURIComponent(c.acct_num)}`);
    const j = await res.json();
    setVotes(j);
    setLoading(l => ({ ...l, votes: false }));
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
          <div style={{ ...colStyle, maxWidth: '220px', flexShrink: 0 }}>
            <ColHeader step="Donor" color="var(--green)" />
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.35rem' }}>{donor.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
              {fmtMoneyCompact(donor.total_combined)} total
            </div>
            {donor.industry && <div style={{ fontSize: '0.68rem', color: 'var(--gold)' }}>{donor.industry}</div>}
            <Link href={`/donor/${donor.slug}`} style={{ fontSize: '0.68rem', color: 'var(--teal)', textDecoration: 'none', display: 'block', marginTop: '0.5rem' }}>
              full profile →
            </Link>
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

          {/* Votes */}
          <div style={colStyle}>
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
                      ? <div style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>No vote records found.</div>
                      : votes.votes.map((v, i) => (
                        <div key={i} style={{ ...rowStyle(false), cursor: 'default' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>
                              {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{v.bill_number}</a> : v.bill_number}
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
          </div>

        </div>
      )}
    </div>
  );
}
