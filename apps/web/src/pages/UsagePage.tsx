import { useTranslation } from 'react-i18next';
import { useUsageData } from '../hooks/useUsageData';
import { useUsageHeatmap } from '../hooks/useUsageHeatmap';
import { UsageLoading, UsageError, UsageEmpty } from '../components/UsageStates';
import { UsageKpiCards } from '../components/UsageKpiCards';
import {
  TokensByProviderChart,
  CostDistributionChart,
  LatencyScatterChart,
} from '../components/UsageCharts';
import { UsageTable } from '../components/UsageTable';
import { UsageInsights } from '../components/UsageInsights';
import { UsageHeatmap } from '../components/UsageHeatmap';

// Re-exported for tests that import it from this module's public surface.
export { ScatterTooltipContent } from '../components/UsageCharts';

export default function UsagePage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
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
  const heatmap = useUsageHeatmap();

  if (loading) return <UsageLoading wrap={wrap} />;
  if (error) return <UsageError wrap={wrap} error={error} onRetry={() => fetchUsage(period)} />;
  if (!view || view.rows.length === 0) {
    return (
      <div className={wrap}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">{t('usage.title')}</h1>
        </div>
        <div className="mb-6">
          <UsageHeatmap data={heatmap.data} loading={heatmap.loading} error={heatmap.error} />
        </div>
        <UsageEmpty wrap="" />
      </div>
    );
  }

  return (
    <div className={wrap}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">{t('usage.title')}</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">
            {t('usage.summary', {
              period: period === 'all' ? t('usage.summaryAll') : t('usage.summary30d'),
              modelsCount: view.rows.length,
              modelsLabel: t(`usage.summaryModel_${view.rows.length === 1 ? 'one' : 'other'}`),
              providersCount: providerData.length,
              providersLabel: t(
                `usage.summaryProvider_${providerData.length === 1 ? 'one' : 'other'}`
              ),
            })}
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
          {(
            [
              { key: 'all', label: t('usage.periodToggle.total') },
              { key: '30d', label: t('usage.periodToggle.days30') },
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

      <div className="mb-6">
        <UsageHeatmap data={heatmap.data} loading={heatmap.loading} error={heatmap.error} />
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
