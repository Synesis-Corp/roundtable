import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/api-client';
import type { HeatmapPeriod, HeatmapResponse } from './useUsageHeatmap';

interface UseAdminUsageHeatmapReturn {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
  period: HeatmapPeriod;
  setPeriod: (period: HeatmapPeriod) => void;
  refetch: () => void;
}

const DEFAULT_PERIOD: HeatmapPeriod = '6m';

/**
 * Loads the global (admin) per-day usage heatmap. Same shape as
 * `useUsageHeatmap` but hits `/admin/metrics/usage-heatmap` and does not
 * scope to a single user.
 */
export function useAdminUsageHeatmap(): UseAdminUsageHeatmapReturn {
  const [period, setPeriodState] = useState<HeatmapPeriod>(DEFAULT_PERIOD);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<HeatmapResponse>(`/admin/metrics/usage-heatmap?period=${period}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchHeatmap();
  }, [fetchHeatmap]);

  const setPeriod = useCallback((next: HeatmapPeriod) => {
    setPeriodState(next);
  }, []);

  return {
    data,
    loading,
    error,
    period,
    setPeriod,
    refetch: () => void fetchHeatmap(),
  };
}
