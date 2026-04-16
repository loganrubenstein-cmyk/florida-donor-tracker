'use client';

import { useEffect, useState } from 'react';

const SEQUENCE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

const FACTS = [
  { label: 'Largest single contribution in FL history', value: '$5,000,000', donor: 'Ken Griffin → Ron DeSantis (2022)' },
  { label: 'Total raised by FL candidates (all time)', value: '$3.9 Billion', donor: 'Across 30+ years of state races' },
  { label: 'Most active donor industry', value: 'Real Estate', donor: 'Leads FL campaign giving every cycle' },
  { label: 'FL politicians raised in 2022 cycle alone', value: '$823 Million', donor: 'Governor + Legislature combined' },
];

export default function KonamiCode() {
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const fact = FACTS[Math.floor(Math.random() * FACTS.length)];

  useEffect(() => {
    let idx = 0;
    function onKey(e) {
      const key = e.key.toLowerCase() === 'b' ? 'b' : e.key.toLowerCase() === 'a' ? 'a' : e.key;
      if (key === SEQUENCE[idx]) {
        idx++;
        setProgress(idx);
        if (idx === SEQUENCE.length) {
          setOpen(true);
          idx = 0;
          setProgress(0);
        }
      } else {
        idx = key === SEQUENCE[0] ? 1 : 0;
        setProgress(idx);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(1,1,13,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.25s ease-out',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: 'var(--surface)', border: '2px solid rgba(220,60,60,0.4)',
          borderRadius: '3px', padding: '2.5rem 2rem', maxWidth: '460px', width: '90%',
          position: 'relative', textAlign: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* CLASSIFIED stamp */}
        <div style={{
          position: 'absolute', top: '1rem', right: '1rem',
          fontSize: '0.6rem', fontWeight: 900, letterSpacing: '0.15em',
          color: 'rgba(220,60,60,0.6)', fontFamily: 'var(--font-mono)',
          border: '2px solid rgba(220,60,60,0.4)', padding: '0.1rem 0.4rem',
          transform: 'rotate(3deg)',
          textTransform: 'uppercase',
        }}>
          CLASSIFIED
        </div>

        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
          ⚠ Classified Briefing ⚠
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          {fact.label}
        </div>

        <div style={{
          fontSize: '2.8rem', fontWeight: 900, color: 'var(--orange)',
          fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', lineHeight: 1,
        }}>
          {fact.value}
        </div>

        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '1.75rem' }}>
          {fact.donor}
        </div>

        <div style={{ fontSize: '0.6rem', color: 'rgba(90,106,136,0.6)', fontFamily: 'var(--font-mono)', marginBottom: '1.25rem' }}>
          This briefing will self-destruct when you click anywhere.
        </div>

        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent', border: '1px solid rgba(220,60,60,0.3)',
            color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
            padding: '0.4rem 1rem', borderRadius: '2px', cursor: 'pointer',
          }}
        >
          ACKNOWLEDGE &amp; DISMISS
        </button>
      </div>
    </div>
  );
}
