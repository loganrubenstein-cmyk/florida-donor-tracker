'use client';

import useCountUp from '@/lib/useCountUp';

function formatDollars(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export default function HeroCounter({ total }) {
  const display = useCountUp(total, { duration: 2000 });

  return (
    <span style={{ color: 'var(--orange)' }}>
      {(!total || isNaN(total)) ? '$0' : formatDollars(display)}
    </span>
  );
}
