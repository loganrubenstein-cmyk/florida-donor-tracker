'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoneyCompact } from '@/lib/fmt'

function partyColor(code) {
  if (code === 'REP' || code === 'R') return 'var(--republican)'
  if (code === 'DEM' || code === 'D') return 'var(--democrat)'
  return 'var(--text-dim)'
}

function SearchInput({ label, color, initialName, onSelect, otherAcct }) {
  const [query, setQuery] = useState(initialName || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setQuery(initialName || '')
  }, [initialName])

  const fetchResults = useCallback((q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/candidates?q=${encodeURIComponent(q)}&sort=total_combined&sort_dir=desc&page=1`)
      .then(r => r.json())
      .then(json => {
        const rows = (json.data || []).filter(c => String(c.acct_num) !== String(otherAcct))
        setResults(rows.slice(0, 8))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [otherAcct])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query || query.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => fetchResults(query), 220)
    return () => clearTimeout(debounceRef.current)
  }, [query, fetchResults])

  const handleSelect = (candidate) => {
    setQuery(candidate.candidate_name)
    setResults([])
    setOpen(false)
    onSelect(candidate)
  }

  const handleBlur = (e) => {
    if (listRef.current?.contains(e.relatedTarget)) return
    setTimeout(() => setOpen(false), 120)
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: color, letterSpacing: '0.18em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by name — DeSantis, Scott, Crist…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (query.length >= 2) setOpen(true) }}
          onBlur={handleBlur}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${color}55`,
            borderRadius: '3px',
            padding: '0.6rem 0.85rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        {loading && (
          <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
            …
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            marginTop: '2px',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {results.map(c => (
            <button
              key={c.acct_num}
              onMouseDown={() => handleSelect(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.55rem 0.85rem',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)' }}>
                {c.candidate_name}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                {[c.office_desc, c.election_year, c.party_code].filter(Boolean).join(' · ')}
                {c.total_combined ? <span style={{ color: partyColor(c.party_code), marginLeft: '0.5rem' }}>{fmtMoneyCompact(parseFloat(c.total_combined))}</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ComparePicker({ currentA, currentB }) {
  const router = useRouter()
  const [aAcct, setAAcct] = useState(currentA?.acct_num || null)
  const [bAcct, setBAcct] = useState(currentB?.acct_num || null)
  const [aName, setAName] = useState(currentA?.candidate_name || '')
  const [bName, setBName] = useState(currentB?.candidate_name || '')

  const handleSelectA = (c) => {
    setAAcct(c.acct_num)
    setAName(c.candidate_name)
    if (bAcct) router.push(`/compare?a=${c.acct_num}&b=${bAcct}`)
  }
  const handleSelectB = (c) => {
    setBAcct(c.acct_num)
    setBName(c.candidate_name)
    if (aAcct) router.push(`/compare?a=${aAcct}&b=${c.acct_num}`)
  }

  const ready = aAcct && bAcct

  return (
    <div style={{ marginBottom: '2rem', padding: '1.25rem 1.5rem', border: '1px solid var(--border)', borderRadius: '4px', background: 'rgba(255,255,255,0.015)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: '1rem' }}>
        ◤ CHOOSE CANDIDATES TO COMPARE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 1fr', gap: '0.75rem', alignItems: 'start' }}>
        <SearchInput
          label="CANDIDATE A"
          color="var(--republican)"
          initialName={aName}
          onSelect={handleSelectA}
          otherAcct={bAcct}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '1.4rem', fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--orange)', fontStyle: 'italic' }}>
          vs
        </div>
        <SearchInput
          label="CANDIDATE B"
          color="var(--democrat)"
          initialName={bName}
          onSelect={handleSelectB}
          otherAcct={aAcct}
        />
      </div>
      {!ready && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.85rem' }}>
          Search and select both candidates above to see the side-by-side comparison.
        </div>
      )}
    </div>
  )
}
