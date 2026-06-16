import { storage } from '../lib/storage';
import { useState, useEffect, useCallback } from 'react';
import type { ModelInfo } from '@chat/sdk';
import { apiGet } from '../lib/api-client';
import { PROVIDERS_CHANGED_EVENT } from '../lib/provider-events';

export interface UseModelsReturn {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  searchModels: (query: string) => ModelInfo[];
  refetch: () => void;
}

export function useModels(): UseModelsReturn {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(() => {
    setLoading(true);
    setError(null);

    const token = storage.get('token');
    if (!token) {
      setModels([]);
      setLoading(false);
      return;
    }

    apiGet<{ models: ModelInfo[] }>('/providers/connected')
      .then((data) => {
        setModels(data.models ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load models');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Onboarding Fase 2.1 (2026-06-14): keep the visible model list in sync
  // with connect/disconnect events. useSettings emits the event; we refetch.
  // Listener is added once per mount and removed on unmount.
  useEffect(() => {
    const handler = () => {
      fetchModels();
    };
    window.addEventListener(PROVIDERS_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(PROVIDERS_CHANGED_EVENT, handler);
    };
  }, [fetchModels]);

  const searchModels = useCallback(
    (query: string) => {
      if (!query.trim()) return models;
      const q = query.toLowerCase();
      return models.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    },
    [models]
  );

  return {
    models,
    loading,
    error,
    searchModels,
    refetch: fetchModels,
  };
}
