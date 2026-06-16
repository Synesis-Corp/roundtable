import { useUsageData } from '../hooks/useUsageData';
import { UsageLoading, UsageError, UsageEmpty } from '../components/UsageStates';
import { UsageKpiCards } from '../components/UsageKpiCards';
import {
  TokensByProviderChart,
  CostDistributionChart,
  LatencyScatterChart,
} from '../components/UsageCharts';
import { UsageTable } from '../components/UsageTable';
import { UsageInsights } from '../components/UsageInsights';

// Re-exported for tests that import it from this module's public surface.
export { ScatterTooltipContent } from '../components/UsageCharts';

export default function UsagePage({ embedded = false }: { embedded?: boolean } = {}) {
  // When embedded inside the Settings tabs, the parent already provides the
  // page container — so we drop our own max-width/padding to fill it cleanly.
  const wrap = embedded ? 'px-4' : 'p-6 max-w-7xl mx-auto';
  const {
    period,
    setPeriod,
    loading,
    error,
    fetchUsage,
    view,
    providerData,
    pieData,
    tokensPerRequest,
    hasEstimatedCosts,
  } = useUsageData();

  if (loading) return <UsageLoading wrap={wrap} />;
  if (error) return <UsageError wrap={wrap} error={error} onRetry={() => fetchUsage(period)} />;
  if (!view || view.rows.length === 0) return <UsageEmpty wrap={wrap} />;

  return (
    <div className={wrap}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">Uso de IA</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            {period === 'all' ? 'Histórico completo' : 'Últimos 30 días'} · {view.rows.length}{' '}
            {view.rows.length === 1 ? 'modelo' : 'modelos'} · {providerData.length}{' '}
            {providerData.length === 1 ? 'proveedor' : 'proveedores'}
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
          {(
            [
              { key: 'all', label: 'Total' },
              { key: '30d', label: '30 días' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: period === key ? 'var(--accent)' : 'transparent',
                color: period === key ? '#fff' : 'var(--text-3)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <UsageKpiCards
        totals={view.totals}
        tokensPerRequest={tokensPerRequest}
        hasEstimatedCosts={hasEstimatedCosts}
      />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <TokensByProviderChart providerData={providerData} />
        <CostDistributionChart pieData={pieData} />
      </div>

      <LatencyScatterChart rows={view.rows} />

      <UsageTable rows={view.rows} hasEstimatedCosts={hasEstimatedCosts} />

      <UsageInsights insights={view.insights} />
    </div>
  );
}
