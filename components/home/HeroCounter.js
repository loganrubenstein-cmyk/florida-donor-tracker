'use client'

import { useEffect, useRef, useState } from 'react'

const DURATION = 2000 // ms

function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4)
}

function formatDollars(n) {
  return '$' + Math.floor(n).toLocaleString('en-US')
}

export default function HeroCounter({ total }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    if (!total || isNaN(total)) return
    startRef.current = null

    function tick(timestamp) {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / DURATION, 1)
      const eased = easeOutQuart(progress)
      setDisplay(Math.floor(eased * total))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(total)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [total])

  return (
    <span style={{ color: 'var(--orange)' }}>
      {(!total || isNaN(total)) ? '$0' : formatDollars(display)}
    </span>
  )
}
