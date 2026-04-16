'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  "You've reached the bottom of Florida politics. It's not pretty down here.",
  "Congratulations. You've seen more of this data than most elected officials have.",
  "Fun fact: scrolling this far burned more calories than some lobbyist lunches cost.",
  "You're now legally required to tell three people about soft money.",
];

export default function BottomToast() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [msg] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);

  useEffect(() => {
    if (dismissed) return;
    function onScroll() {
      const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (distFromBottom < 120 && !dismissed) {
        setVisible(true);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dismissed]);

  if (!visible && !dismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 500, maxWidth: '520px', width: 'calc(100% - 2rem)',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--orange)',
      borderRadius: '3px', padding: '0.75rem 1rem',
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      opacity: dismissed ? 0 : 1,
      transition: 'opacity 0.3s ease-out',
      pointerEvents: dismissed ? 'none' : 'auto',
    }}>
      <span style={{ fontSize: '0.85rem', flexShrink: 0, marginTop: '0.05rem' }}>💡</span>
      <span style={{
        fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        lineHeight: 1.5, flex: 1,
      }}>
        {msg}
      </span>
      <button
        onClick={() => { setDismissed(true); setTimeout(() => setVisible(false), 320); }}
        style={{
          background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
          fontSize: '0.85rem', padding: '0', flexShrink: 0, lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
