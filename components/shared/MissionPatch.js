// Mission patch roundels for pillar-page section headers.
// Chosen by user 2026-04-14:
//   donors     → D2 dollar sign (corrected S-curve)
//   candidates → C3 podium
//   committees → M3 three-person group
//   network    → N1 force-graph cluster
//   lobbying   → none (user choice)
// All others (elections, legislature, legislators, tools, etc.) → no patch.

const PATCHES = {
  donors: (sw) => (
    <>
      {/* Vertical bar */}
      <line x1="24" y1="11" x2="24" y2="37" stroke="var(--orange)" strokeWidth={sw * 0.8} strokeOpacity="0.5" strokeLinecap="round"/>
      {/* S-curve: upper C opens upward, lower C opens downward */}
      <path
        d="M 33,18 Q 24,12 15,18 Q 15,24 24,24 Q 33,24 33,30 Q 24,36 15,30"
        fill="none" stroke="var(--orange)" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),

  candidates: (sw) => (
    <>
      {/* Podium body */}
      <path d="M 15,27 L 19,27 L 19,36 L 29,36 L 29,27 L 33,27 L 33,29 L 15,29 Z"
        fill="none" stroke="var(--orange)" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
      {/* Head */}
      <circle cx="24" cy="14" r="4" fill="none" stroke="var(--orange)" strokeWidth={sw}/>
      {/* Torso */}
      <line x1="24" y1="18" x2="24" y2="27" stroke="var(--orange)" strokeWidth={sw} strokeLinecap="round"/>
      {/* Arms to podium */}
      <line x1="24" y1="23" x2="19" y2="27" stroke="var(--orange)" strokeWidth={sw * 0.8} strokeLinecap="round" strokeOpacity="0.6"/>
      <line x1="24" y1="23" x2="29" y2="27" stroke="var(--orange)" strokeWidth={sw * 0.8} strokeLinecap="round" strokeOpacity="0.6"/>
    </>
  ),

  committees: (sw) => (
    <>
      {/* Center person */}
      <circle cx="24" cy="17" r="3.5" fill="none" stroke="var(--orange)" strokeWidth={sw}/>
      <path d="M 18,33 Q 18,25 24,25 Q 30,25 30,33"
        fill="none" stroke="var(--orange)" strokeWidth={sw} strokeLinecap="round"/>
      {/* Left person */}
      <circle cx="13" cy="19" r="2.8" fill="none" stroke="var(--orange)" strokeWidth={sw * 0.85} strokeOpacity="0.6"/>
      <path d="M 8,33 Q 8,26 13,26 Q 18,26 18,33"
        fill="none" stroke="var(--orange)" strokeWidth={sw * 0.85} strokeLinecap="round" strokeOpacity="0.6"/>
      {/* Right person */}
      <circle cx="35" cy="19" r="2.8" fill="none" stroke="var(--orange)" strokeWidth={sw * 0.85} strokeOpacity="0.6"/>
      <path d="M 30,33 Q 30,26 35,26 Q 40,26 40,33"
        fill="none" stroke="var(--orange)" strokeWidth={sw * 0.85} strokeLinecap="round" strokeOpacity="0.6"/>
    </>
  ),

  network: (sw) => (
    <>
      {/* Edges */}
      <line x1="24" y1="15" x2="15" y2="29" stroke="var(--orange)" strokeWidth={sw * 0.75} strokeOpacity="0.45"/>
      <line x1="24" y1="15" x2="33" y2="29" stroke="var(--orange)" strokeWidth={sw * 0.75} strokeOpacity="0.45"/>
      <line x1="15" y1="29" x2="33" y2="29" stroke="var(--orange)" strokeWidth={sw * 0.75} strokeOpacity="0.45"/>
      <line x1="24" y1="15" x2="24" y2="24" stroke="var(--orange)" strokeWidth={sw * 0.6} strokeOpacity="0.3"/>
      <line x1="15" y1="29" x2="24" y2="24" stroke="var(--orange)" strokeWidth={sw * 0.6} strokeOpacity="0.3"/>
      <line x1="33" y1="29" x2="24" y2="24" stroke="var(--orange)" strokeWidth={sw * 0.6} strokeOpacity="0.3"/>
      {/* Outer nodes */}
      <circle cx="24" cy="15" r="3" fill="var(--orange)"/>
      <circle cx="15" cy="29" r="3" fill="var(--orange)"/>
      <circle cx="33" cy="29" r="3" fill="var(--orange)"/>
      {/* Center node */}
      <circle cx="24" cy="24" r="2" fill="var(--orange)" opacity="0.55"/>
    </>
  ),
};

// size: pixel dimension of the rendered SVG (square)
// Ring opacity intentionally low — patch reads as a background frame
export default function MissionPatch({ slug, size = 48 }) {
  const inner = PATCHES[slug];
  if (!inner) return null;

  const sw = size >= 40 ? 1.8 : 1.5;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="24" cy="24" r="21"
        fill="none"
        stroke="var(--orange)"
        strokeWidth="1.8"
        opacity="0.4"
      />
      {inner(sw)}
    </svg>
  );
}
