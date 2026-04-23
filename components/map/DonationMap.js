'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fmtMoneyCompact, fmtMoney } from '@/lib/fmt';

const TABS = [
  { key: 'flmap',       label: 'Florida Map' },
  { key: 'cities',      label: 'Top FL Cities' },
  { key: 'states',      label: 'By State' },
  { key: 'instateout',  label: 'In-State vs. Out' },
];

// FL city → [lon, lat] for the most common donor-origin cities in the data.
// Coordinates are approximate city centroids; map uses a simple equirectangular
// projection over the state's bounding box. Unknown cities are counted in the
// footer but not plotted. Audit the /api/map?view=cities response against this
// table periodically — add any city ranked in the top 40 by total$.
const FL_CITY_COORDS = {
  'TALLAHASSEE':      [-84.280, 30.438],
  'MIAMI':            [-80.194, 25.774],
  'ORLANDO':          [-81.379, 28.538],
  'TAMPA':            [-82.459, 27.950],
  'JACKSONVILLE':     [-81.655, 30.332],
  'FORT LAUDERDALE':  [-80.143, 26.122],
  'WEST PALM BEACH':  [-80.053, 26.715],
  'ST PETERSBURG':    [-82.679, 27.770],
  'ST. PETERSBURG':   [-82.679, 27.770],
  'SAINT PETERSBURG': [-82.679, 27.770],
  'NAPLES':           [-81.795, 26.142],
  'PALM BEACH':       [-80.036, 26.706],
  'SARASOTA':         [-82.531, 27.336],
  'CORAL GABLES':     [-80.276, 25.721],
  'BOCA RATON':       [-80.083, 26.358],
  'HOLLYWOOD':        [-80.149, 26.011],
  'GAINESVILLE':      [-82.325, 29.651],
  'PENSACOLA':        [-87.217, 30.421],
  'FORT MYERS':       [-81.872, 26.640],
  'OCALA':            [-82.141, 29.187],
  'PANAMA CITY':      [-85.660, 30.158],
  'LAKELAND':         [-81.949, 28.040],
  'KEY WEST':         [-81.780, 24.555],
  'DAYTONA BEACH':    [-81.023, 29.211],
  'CLEARWATER':       [-82.800, 27.965],
  'MIAMI BEACH':      [-80.130, 25.790],
  'AVENTURA':         [-80.143, 25.957],
  'WINTER PARK':      [-81.339, 28.600],
  'DORAL':            [-80.355, 25.819],
  'WESTON':           [-80.399, 26.100],
  'DELRAY BEACH':     [-80.073, 26.461],
  'JUPITER':          [-80.094, 26.934],
  'STUART':           [-80.253, 27.198],
  'MELBOURNE':        [-80.608, 28.084],
  'PLANTATION':       [-80.233, 26.134],
  'CORAL SPRINGS':    [-80.271, 26.271],
  'POMPANO BEACH':    [-80.125, 26.238],
  'WELLINGTON':       [-80.267, 26.659],
  'BRADENTON':        [-82.571, 27.499],
  'FORT PIERCE':      [-80.324, 27.447],
  'VERO BEACH':       [-80.397, 27.638],
  'MIRAMAR':          [-80.229, 25.987],
  'DAVIE':            [-80.251, 26.076],
  'SUNRISE':          [-80.306, 26.141],
  'HIALEAH':          [-80.278, 25.858],
  // Added 2026-04-22 from /api/map coverage audit — top-30 cities missed:
  'CLEWISTON':        [-80.935, 26.755],
  'LAKE BUENA VISTA': [-81.520, 28.395],
  'JUNO BEACH':       [-80.066, 26.885],
  'VENICE':           [-82.454, 27.100],
  'DEERFIELD BEACH':  [-80.099, 26.318],
  'MIAMI SHORES':     [-80.190, 25.864],
  'DADE CITY':        [-82.196, 28.365],
  // Additional common FL cities that show up in longer-tail queries:
  'PORT SAINT LUCIE': [-80.353, 27.274],
  'PORT ST LUCIE':    [-80.353, 27.274],
  'PORT ST. LUCIE':   [-80.353, 27.274],
  'CAPE CORAL':       [-81.950, 26.563],
  'KISSIMMEE':        [-81.408, 28.292],
  'PALM BAY':         [-80.587, 28.034],
  'BOYNTON BEACH':    [-80.066, 26.525],
  'SPRING HILL':      [-82.568, 28.481],
  'POMPANO':          [-80.125, 26.238],
  'PORT ORANGE':      [-81.006, 29.138],
  'PALM HARBOR':      [-82.762, 28.078],
  'LARGO':            [-82.788, 27.910],
  'PINELLAS PARK':    [-82.700, 27.843],
  'NORTH MIAMI':      [-80.186, 25.890],
  'NORTH MIAMI BEACH':[-80.163, 25.933],
  'MARATHON':         [-81.090, 24.714],
  'KEY LARGO':        [-80.453, 25.086],
  'OCOEE':            [-81.544, 28.569],
  'ALTAMONTE SPRINGS':[-81.373, 28.661],
  'APOPKA':           [-81.511, 28.676],
  'CASSELBERRY':      [-81.328, 28.677],
  'LONGWOOD':         [-81.339, 28.703],
  'SANFORD':          [-81.269, 28.800],
  'DELTONA':          [-81.264, 28.901],
  'ORMOND BEACH':     [-81.056, 29.286],
  'NEW SMYRNA BEACH': [-80.926, 29.026],
  'TITUSVILLE':       [-80.808, 28.612],
  'COCOA':            [-80.742, 28.386],
  'ROCKLEDGE':        [-80.725, 28.350],
  'SATELLITE BEACH':  [-80.600, 28.175],
  'INDIALANTIC':      [-80.566, 28.088],
  'FERNANDINA BEACH': [-81.462, 30.669],
  'NEPTUNE BEACH':    [-81.396, 30.310],
  'ATLANTIC BEACH':   [-81.398, 30.336],
  'JACKSONVILLE BEACH':[-81.393, 30.295],
  'PONTE VEDRA BEACH':[-81.388, 30.240],
  'ST AUGUSTINE':     [-81.314, 29.901],
  'ST. AUGUSTINE':    [-81.314, 29.901],
  'SAINT AUGUSTINE':  [-81.314, 29.901],
};

// Florida SVG path — sourced from components/shared/FloridaOutline.js (USGS/PublicaMundi
// derived). ViewBox 0 0 520 430. Covers mainland FL + Keys arc.
const FL_OUTLINE_PATH = `
  M 149,10 L 181,10 L 190,29 L 279,33 L 362,38 L 365,52 L 373,52 L 376,38 L 373,26
  L 380,21 L 394,27 L 412,29 L 416,57 L 424,89 L 443,131 L 472,175 L 468,178 L 469,199
  L 481,222 L 500,269 L 504,283 L 504,298 L 497,352 L 491,353 L 484,370 L 486,375
  L 474,387 L 469,385 L 457,390 L 436,392 L 430,386 L 433,376 L 418,347 L 407,341 L 397,345
  L 389,329 L 387,316 L 373,302 L 370,292 L 372,278 L 365,276 L 367,284 L 360,286
  L 339,251 L 331,242 L 351,216 L 338,217 L 329,225 L 321,213 L 332,177 L 334,147 L 326,140 L 324,131
  L 312,129 L 297,113 L 285,106 L 284,97 L 276,93 L 270,83 L 245,68 L 223,72 L 224,82 L 217,80
  L 190,92 L 161,95 L 162,88 L 155,79 L 121,60 L 97,52 L 75,50 L 57,51
  L 17,57 L 27,47 L 22,42 L 25,31 L 10,19 L 12,10 Z
  M 438,398 C 418,410 390,418 362,422 L 340,424 L 350,420 L 378,416 L 408,408 L 432,396 Z
`;

// Affine lon/lat → SVG projection calibrated to three anchors on the FL path
// (viewBox 520×430):
//   Pensacola    (-87.22, 30.42) → (22,  42)   panhandle NW
//   Jacksonville (-81.66, 30.33) → (400, 50)   peninsula NE
//   Miami        (-80.19, 25.77) → (435, 388)  peninsula SE
// Accounts for FL's tilt (panhandle tilts WNW; peninsula runs NNW→SSE).
// Keys cities (lat < 25.2) get compressed into the Keys arc so they don't fall off.
function project([lon, lat]) {
  const x = 67.99 * lon + 13.97 * lat + 5526.9;
  let y = 1.44 * lon + -72.23 * lat + 2364.8;
  if (lat < 25.2) {
    // Keys arc runs (438,398) → (340,424). Compress residual southing.
    const excess = (25.2 - lat) * 72.23;
    y = 400 + Math.min(excess * 0.25, 20);
  }
  return { x, y };
}

function FloridaMap({ items }) {
  const [hover, setHover] = useState(null);
  const cityData = (items || [])
    .map(it => {
      const key = String(it.city || '').toUpperCase().trim();
      const coords = FL_CITY_COORDS[key];
      if (!coords) return null;
      return { ...it, coords };
    })
    .filter(Boolean);

  // Sort so big bubbles render first (small ones on top), but keep orig for legend
  const ordered = [...cityData].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...cityData.map(c => c.total), 1);
  const minR = 3, maxR = 24;

  function radius(total) {
    const scale = Math.sqrt(total / maxTotal);
    return minR + scale * (maxR - minR);
  }

  const unknown = (items || []).length - cityData.length;

  // Only label cities with bubble r >= threshold to reduce clutter
  const labelThreshold = 10;

  return (
    <div>
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        <svg viewBox="0 0 520 430" style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="xMidYMid meet">
          {/* State outline */}
          <path d={FL_OUTLINE_PATH} fillRule="evenodd" fill="rgba(100,140,220,0.06)" stroke="rgba(100,140,220,0.45)" strokeWidth="1.2" />
          {/* Render big bubbles first so smaller ones stack on top */}
          {ordered.map(c => {
            const { x, y } = project(c.coords);
            const r = radius(c.total);
            const isHover = hover?.city === c.city;
            return (
              <g key={c.city}
                 onMouseEnter={() => setHover(c)}
                 onMouseLeave={() => setHover(null)}
                 style={{ cursor: 'pointer' }}>
                <circle cx={x} cy={y} r={r + (isHover ? 2 : 0)}
                  fill="#ffb060"
                  fillOpacity={isHover ? 0.8 : 0.45}
                  stroke={isHover ? '#ffd060' : '#ffb060'}
                  strokeWidth={isHover ? 2 : 1}
                  style={{ transition: 'all 0.12s' }}
                />
                {(r >= labelThreshold || isHover) && (
                  <text x={x} y={y + r + (isHover ? 11 : 9)} textAnchor="middle" fontSize={isHover ? 10 : 8}
                    fill={isHover ? '#ffd060' : '#c8d8f0'}
                    fontFamily="var(--font-mono)"
                    style={{ pointerEvents: 'none' }}>
                    {c.city}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            padding: '0.6rem 0.85rem', borderRadius: '3px', fontSize: '0.76rem',
            minWidth: '180px', pointerEvents: 'none',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{hover.city}</div>
            <div style={{ color: 'var(--orange)' }}>{fmtMoney(hover.total)}</div>
            {hover.donor_count != null && (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', marginTop: '0.15rem' }}>
                {hover.donor_count.toLocaleString()} donors
              </div>
            )}
          </div>
        )}
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.6rem', lineHeight: 1.55 }}>
        Bubble size = total contributions from donors reporting that city as their address. Tallahassee concentration reflects
        lobbyists, consultants, and government-affiliated donors. Hover any bubble for an exact amount. {unknown > 0 && `${unknown} additional cities in the source data aren't placed on this map (no coordinates yet).`}
      </p>

      {/* Hover-synced legend: top cities plotted on the map */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Cities on the map (ranked)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem' }}>
          {ordered.slice(0, 24).map((c, i) => {
            const isHover = hover?.city === c.city;
            return (
              <div key={c.city}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
                style={{
                  padding: '0.35rem 0.6rem',
                  border: `1px solid ${isHover ? 'rgba(255,176,96,0.5)' : 'var(--border)'}`,
                  borderRadius: '3px',
                  background: isHover ? 'rgba(255,176,96,0.05)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}>
                <span style={{ fontSize: '0.7rem', color: isHover ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i + 1}. {c.city}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                  {fmtMoneyCompact(c.total)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, labelKey }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      padding: '0.6rem 0.85rem', borderRadius: '3px', fontSize: '0.76rem',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ color: 'var(--orange)' }}>{fmtMoney(payload[0].value)}</div>
      {payload[0].payload.donor_count != null && (
        <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', marginTop: '0.15rem' }}>
          {payload[0].payload.donor_count.toLocaleString()} donors
        </div>
      )}
    </div>
  );
}

function CityChart({ items }) {
  const top = items.slice(0, 20);
  const max = Math.max(...top.map(i => i.total));
  return (
    <div>
      <div style={{ height: 500 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{ left: 20, right: 40, top: 16, bottom: 8 }}>
            <XAxis type="number" tickFormatter={v => fmtMoneyCompact(v)} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="city" width={120} interval={0} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,140,220,0.06)' }} />
            <Bar dataKey="total" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {top.map((entry, i) => (
                <Cell key={i} fill={i === 0 ? '#ffb060' : i < 5 ? '#4dd8f0' : '#3a4a7a'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
        Top 20 cities by tracked political contributions. Tallahassee leads because lobbyists, political consultants, and government-affiliated donors are disproportionately concentrated in the capital.
      </p>
    </div>
  );
}

function StateChart({ items }) {
  return (
    <div>
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} layout="vertical" margin={{ left: 8, right: 40, top: 16, bottom: 8 }}>
            <XAxis type="number" tickFormatter={v => fmtMoneyCompact(v)} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="state" width={36} interval={0} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,140,220,0.06)' }} />
            <Bar dataKey="total" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {items.map((entry, i) => (
                <Cell key={i} fill={entry.state === 'FL' ? '#ffb060' : entry.state === 'DC' ? '#ffd060' : '#3a4a7a'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InOutView({ data }) {
  const total = data.in_state + data.out_state;
  const inPct = data.in_state_pct;
  const outPct = data.out_state_pct;
  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          height: '32px',
          borderRadius: '3px',
          overflow: 'hidden',
          display: 'flex',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ width: `${inPct}%`, background: 'var(--orange)', transition: 'width 0.6s ease' }} />
          <div style={{ flex: 1, background: 'rgba(160,192,255,0.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--orange)' }}>Florida ({inPct}%) — {fmtMoneyCompact(data.in_state)}</span>
          <span style={{ color: 'var(--blue)' }}>Out of state ({outPct}%) — {fmtMoneyCompact(data.out_state)}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[
          { label: 'FL donors', value: data.in_count?.toLocaleString(), sub: 'reported Florida address', color: 'var(--orange)' },
          { label: 'Out-of-state donors', value: data.out_count?.toLocaleString(), sub: 'reported non-FL address', color: 'var(--blue)' },
          { label: 'FL donor total', value: fmtMoneyCompact(data.in_state), sub: `${inPct}% of tracked giving`, color: 'var(--orange)' },
          { label: 'Out-of-state total', value: fmtMoneyCompact(data.out_state), sub: `${outPct}% of tracked giving`, color: 'var(--blue)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{stat.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 400, color: stat.color, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>{stat.sub}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '1rem', lineHeight: 1.5 }}>
        Out-of-state donors include national party committees (DNC, RNC), federal PACs, and wealthy individuals whose primary residence is outside Florida. Location is based on the donor's registered address at time of contribution.
      </p>
    </div>
  );
}

export default function DonationMap() {
  const [tab, setTab] = useState('flmap');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);

  async function loadTab(t) {
    // `flmap` reuses the same /api/map?view=cities payload
    const apiView = t === 'flmap' ? 'cities' : t;
    if (cache[apiView]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/map?view=${apiView}`);
      const json = await res.json();
      setCache(prev => ({ ...prev, [apiView]: json }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTab('flmap'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(t) {
    setTab(t);
    loadTab(t);
  }

  const citiesCurrent = cache['cities'];
  const statesCurrent = cache['states'];
  const inOutCurrent  = cache['instateout'];

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button key={t.key} className={tab === t.key ? 'tab tab-active' : 'tab'} onClick={() => switchTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</p>}
      {!loading && tab === 'flmap'      && citiesCurrent && <FloridaMap items={citiesCurrent.items || []} />}
      {!loading && tab === 'cities'     && citiesCurrent && <CityChart items={citiesCurrent.items || []} />}
      {!loading && tab === 'states'     && statesCurrent && <StateChart items={statesCurrent.items || []} />}
      {!loading && tab === 'instateout' && inOutCurrent  && <InOutView data={inOutCurrent} />}
    </div>
  );
}
