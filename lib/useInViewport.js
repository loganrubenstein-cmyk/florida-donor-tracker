'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Returns [ref, inView] where inView flips to true the first time
 * the element enters the viewport. Disconnects the observer after triggering.
 *
 * @param {IntersectionObserverInit} options - Passed to IntersectionObserver
 */
export default function useInViewport(options = {}) {
  const ref    = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;

    // Always fire a fallback — handles cases where ref attaches after
    // the effect runs (e.g. component returns null during loading phase)
    const fallback = setTimeout(() => setInView(true), 350);

    if (!el) return () => clearTimeout(fallback);

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        clearTimeout(fallback);
        setInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.15, ...options });

    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  return [ref, inView];
}
