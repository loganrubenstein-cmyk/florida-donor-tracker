'use client';

const MODES = [
  { id: 'force',  label: 'Force' },
  { id: 'sankey', label: 'Sankey' },
  { id: 'radial', label: 'Radial' },
];

export default function VizSwitcher({ activeMode, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {MODES.map(({ id, label }) => {
        const active = activeMode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              padding: '0.35rem 0.85rem',
              background: active ? 'rgba(77,216,240,0.15)' : 'transparent',
              border: active ? '1px solid var(--teal)' : '1px solid var(--border)',
              color: active ? 'var(--teal)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              borderRadius: '3px',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
