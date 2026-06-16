/** Loading / error / empty states for the Usage dashboard. */

export function UsageLoading({ wrap }: { wrap: string }) {
  return (
    <div className={wrap}>
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-[var(--bg-surface)] rounded-lg w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-[var(--bg-surface)] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-[var(--bg-surface)] rounded-2xl" />
          <div className="h-80 bg-[var(--bg-surface)] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function UsageError({
  wrap,
  error,
  onRetry,
}: {
  wrap: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className={wrap}>
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-[var(--text-3)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[var(--text-1)] mb-2">{error}</h3>
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl font-medium text-sm transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export function UsageEmpty({ wrap }: { wrap: string }) {
  return (
    <div className={wrap}>
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-[var(--text-3)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[var(--text-1)] mb-1">Sin datos de uso</h3>
        <p className="text-sm text-[var(--text-3)]">Empezá a chatear para ver tus métricas</p>
      </div>
    </div>
  );
}
