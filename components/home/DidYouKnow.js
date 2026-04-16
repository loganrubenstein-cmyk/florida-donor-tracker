'use client';

import { useState, useEffect } from 'react';

const FACTS = [
  'Florida Power & Light donated to over 800 FL candidates between 2014–2024.',
  'Rick Scott\'s 2018 U.S. Senate race cost approximately $17 per vote cast.',
  'The top 10 FL lobbying principals account for over 40% of all registered lobbyist compensation.',
  'Ron DeSantis raised more in his 2022 campaign than all other governor candidates combined.',
  'In 2022, FL political committees collectively spent over $1B — a state record.',
  'The average FL PAC receives more than 60% of its funds from just 5 donors.',
  'Sugar industry PACs have donated to candidates in both parties at nearly equal rates.',
  'FL trial lawyers\' associations are among the top 20 donors in every statewide election cycle.',
  'Over 2,400 lobbyists are currently registered to represent principals before the FL Legislature.',
  'The FL Medical Association has been among the top 5 lobbying spenders every session since 2014.',
];

export default function DidYouKnow() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % FACTS.length);
        setVisible(true);
      }, 350);
    }, 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ borderTop: '1px solid rgba(100,140,220,0.08)', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
        Did you know
      </div>
      <div style={{
        fontSize: '0.72rem', color: 'rgba(200,216,240,0.65)', lineHeight: 1.65,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.35s ease',
        minHeight: '2.4em',
      }}>
        {FACTS[idx]}
      </div>
    </div>
  );
}
