/** Three connected nodes: visual metaphor for a Council gathered around one answer. */
export function RoundtableMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path strokeLinecap="round" d="M7.5 7.5l3 9M16.5 7.5l-3 9M8 6h8" />
    </svg>
  );
}
