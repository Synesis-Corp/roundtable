import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPut } from '../lib/api-client';
import { emitProvidersChanged } from '../lib/provider-events';
import type { ModelInfo } from '@chat/sdk';

interface UseActiveModelsReturn {
  /** All selectable models for the provider (the same top-N /connected surfaces). */
  models: ModelInfo[];
  /** Currently active ids. Empty = no allow-list saved → all models are shown. */
  activeIds: string[];
  loading: boolean;
  error: string | null;
  /** Persist the allow-list. An empty array resets the provider to "show all". */
  save: (modelIds: string[]) => Promise<void>;
}

/**
 * Loads the per-provider "active models" allow-list for the modal (mejora #1).
 * Fetches when `providerId` is non-null; clears when it goes back to null
 * (modal closed). The chat model selector reads /connected, which the backend
 * already filters with the same config, so saving here narrows the whole UI.
 */
export function useActiveModels(providerId: string | null): UseActiveModelsReturn {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) {
      setModels([]);
      setActiveIds([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<{ models: ModelInfo[]; activeIds: string[] }>(
      `/providers/active-models/${encodeURIComponent(providerId)}`
    )
      .then((data) => {
        if (cancelled) return;
        setModels(data.models ?? []);
        setActiveIds(data.activeIds ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('chat.errors.loadActiveModelsFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, t]);

  const save = useCallback(
    async (modelIds: string[]) => {
      if (!providerId) return;
      const data = await apiPut<{ activeIds: string[] }>(
        `/providers/active-models/${encodeURIComponent(providerId)}`,
        { modelIds }
      );
      setActiveIds(data.activeIds ?? []);
      // The visible model list (useModels -> /providers/connected) is filtered by
      // this same allow-list on the backend, so any consumer of /connected is
      // holding a stale cache. Tell the bus to refetch.
      emitProvidersChanged();
    },
    [providerId]
  );

  return { models, activeIds, loading, error, save };
}
