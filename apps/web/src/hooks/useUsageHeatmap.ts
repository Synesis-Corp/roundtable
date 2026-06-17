import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/api-client';

export type HeatmapPeriod = '3m' | '6m' | '12m';

export interface HeatmapDay {
  date: string;
  tokens: number;
}

export interface HeatmapResponse {
  period: HeatmapPeriod;
  days: HeatmapDay[];
  totalTokens: number;
  peakTokens: number;
  activeDays: number;
}

interface UseUsageHeatmapReturn {
  data: HeatmapResponse | null;
  loading: boolean;
  error: string | null;
  period: HeatmapPeriod;
  setPeriod: (period: HeatmapPeriod) => void;
  refetch: () => void;
}

const DEFAULT_PERIOD: HeatmapPeriod = '6m';

/**
 * Loads the user's per-day usage heatmap. Re-fetches when `period` changes.
 * The endpoint is `/usage/heatmap?period=…` (user-scoped) — admin uses a
 * separate hook with a different URL.
 */
export function useUsageHeatmap(): UseUsageHeatmapReturn {
  const [period, setPeriodState] = useState<HeatmapPeriod>(DEFAULT_PERIOD);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<HeatmapResponse>(`/usage/heatmap?period=${period}`);
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
