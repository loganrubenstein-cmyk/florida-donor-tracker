'use client';

import { useState, useEffect, useRef } from 'react';

const DEFAULT_DURATION = 1800;

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Counts a number from 0 to `target` over `duration` ms using easeOutQuart.
 * SSR-safe: initializes to `target` so server render shows the real value.
 * After hydration, resets to 0 and animates up.
 *
 * @param {number} target   - Final value
 * @param {object} options
 * @param {boolean} options.enabled  - Only animate when true (default: true)
 * @param {number}  options.duration - Animation duration in ms (default: 1800)
 */
export default function useCountUp(target, { enabled = true, duration = DEFAULT_DURATION } = {}) {
  const [value, setValue] = useState(target);
  const rafRef   = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!enabled || !target || isNaN(target)) return;

    setValue(0);
    startRef.current = null;

    function tick(ts) {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      setValue(Math.floor(easeOutQuart(progress) * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled, duration]);

  return value;
}
