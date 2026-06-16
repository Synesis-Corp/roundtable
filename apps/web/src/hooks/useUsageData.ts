import { useState, useEffect, useMemo } from 'react';
import { apiGet } from '../lib/api-client';
import {
  type UsageResponse,
  ALWAYS_VISIBLE_PROVIDERS,
  computeTotals,
  getProviderColor,
} from '../lib/usage-helpers';

/**
 * Owns the Usage dashboard data lifecycle: fetches /usage (on mount + period
 * change), loads the connected providers to hide stale rows, and derives every
 * chart-ready aggregation. Returns the raw flags plus the filtered `view` and
 * memoized datasets the presentational components render.
 */
export function useUsageData() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Set of provider ids the user currently has connected. null = not loaded yet
  // (we show everything until we know, to avoid flashing an empty dashboard).
  const [configured, setConfigured] = useState<Set<string> | null>(null);

  async function fetchUsage(selectedPeriod: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<UsageResponse>(`/usage?period=${selectedPeriod}`);
      setData(response);
    } catch {
      setError('No se pudieron cargar los datos de uso');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsage(period);
  }, [period]);

  // Load the user's connected providers once, to hide historical usage from
  // providers they've since disconnected (6.3). A failure here is non-fatal:
  // we leave `configured` null and fall back to showing every row.
  useEffect(() => {
    let cancelled = false;
    apiGet<Array<{ providerId: string; isActive: boolean }>>('/providers')
      .then((providers) => {
        if (cancelled) return;
        const active = providers.filter((p) => p.isActive).map((p) => p.providerId);
        setConfigured(new Set(active));
      })
      .catch((err) => {
        // Non-fatal: if /providers fails we simply keep showing all rows.
        console.error('Failed to load configured providers:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the configured-providers filter. If nothing is hidden (or we don't yet
  // know which providers are connected), pass `data` through untouched.
  const view = useMemo<UsageResponse | null>(() => {
    if (!data) return null;
    if (!configured) return data;
    const rows = data.rows.filter(
      (r) => configured.has(r.providerId) || ALWAYS_VISIBLE_PROVIDERS.has(r.providerId)
    );
    if (rows.length === data.rows.length) return data;
    return { ...data, rows, totals: computeTotals(rows) };
  }, [data, configured]);

  const providerData = useMemo(() => {
    if (!view) return [];
    const agg = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        requestCount: number;
      }
    >();

    for (const row of view.rows) {
      if (row.totalTokens === 0 && row.estimatedCostUsd === 0) continue;
      const existing = agg.get(row.providerId);
      if (existing) {
        existing.inputTokens += row.inputTokens;
        existing.outputTokens += row.outputTokens;
        existing.totalTokens += row.totalTokens;
        existing.estimatedCostUsd += row.estimatedCostUsd;
        existing.requestCount += row.requestCount;
      } else {
        agg.set(row.providerId, {
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          totalTokens: row.totalTokens,
          estimatedCostUsd: row.estimatedCostUsd,
          requestCount: row.requestCount,
        });
      }
    }

    return Array.from(agg.entries()).map(([providerId, values]) => ({
      providerId,
      ...values,
      fill: getProviderColor(providerId),
    }));
  }, [view]);

  const pieData = useMemo(() => {
    return providerData
      .filter((d) => d.estimatedCostUsd > 0)
      .map((d) => ({
        name: d.providerId,
        value: d.estimatedCostUsd,
        fill: d.fill,
      }));
  }, [providerData]);

  const tokensPerRequest = useMemo(() => {
    if (!view || view.totals.totalRequests === 0) return 0;
    return Math.round(view.totals.totalTokens / view.totals.totalRequests);
  }, [view]);

  const hasEstimatedCosts = useMemo(() => {
    if (!view) return false;
    return view.rows.some((r) => !r.hasBreakdown && r.estimatedCostUsd > 0);
  }, [view]);

  return {
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
  };
}
