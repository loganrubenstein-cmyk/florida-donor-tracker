import { getGlossary } from '@/lib/glossary';

export default function GlossaryTerm({ term, children }) {
  const definition = getGlossary(term);
  const label = children ?? term;
  if (!definition) return <>{label}</>;
  return (
    <span
      title={definition}
      style={{
        textDecoration: 'underline dotted',
        textDecorationColor: 'var(--text-dim)',
        textUnderlineOffset: '3px',
        cursor: 'help',
      }}
    >
      {label}
    </span>
  );
}
