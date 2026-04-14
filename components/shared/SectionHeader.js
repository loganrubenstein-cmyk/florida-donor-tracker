import MissionPatch from '@/components/shared/MissionPatch';

// Unified pillar-page section header — Variant B style (mission patch + rule + eyebrow).
// Props:
//   title    (string)  — the h1 text
//   eyebrow  (string)  — dim uppercase line above h1, e.g. "FL Candidates · 1996–2026"
//   patch    (string)  — slug for MissionPatch ('donors'|'candidates'|'committees'|'network')
//                        omit or null for no patch
//   rule     (bool)    — show angled orange rule below h1 (default true)

export default function SectionHeader({ title, eyebrow, patch, rule = true }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        {patch && <MissionPatch slug={patch} size={44} />}
        <div>
          {eyebrow && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.52rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--orange)',
              opacity: 0.7,
              marginBottom: '0.3rem',
            }}>
              {eyebrow}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
            fontWeight: 400,
            color: '#fff',
            lineHeight: 1,
            margin: 0,
          }}>
            {title}
          </h1>
        </div>
      </div>
      {rule && (
        <div style={{
          height: '2px',
          marginTop: '0.6rem',
          background: 'linear-gradient(90deg, var(--orange) 0%, rgba(255,176,96,0.1) 75%, transparent 100%)',
          transform: 'skewX(-3deg)',
          transformOrigin: 'left center',
        }} />
      )}
    </div>
  );
}
