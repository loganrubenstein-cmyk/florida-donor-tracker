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
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.15, ...options });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, inView];
}
