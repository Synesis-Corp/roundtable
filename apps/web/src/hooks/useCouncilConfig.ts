import { storage } from '../lib/storage';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPut, apiDelete } from '../lib/api-client';

export interface CouncilConfig {
  id: string;
  userId: string;
  modelIds: string[];
  mode: 'auto' | 'manual';
  createdAt: string;
  updatedAt: string;
}

interface UseCouncilConfigReturn {
  config: CouncilConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (modelIds: string[], mode: 'auto' | 'manual') => Promise<void>;
  deleteConfig: () => Promise<void>;
}

export function useCouncilConfig(): UseCouncilConfigReturn {
  const { t } = useTranslation();
  const [config, setConfig] = useState<CouncilConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    setError(null);

    const token = storage.get('token');
    if (!token) {
      setConfig(null);
      setLoading(false);
      return;
    }

    apiGet<CouncilConfig | undefined>('/council/config')
      .then((data) => {
        if (data === undefined) {
          setConfig(null);
        } else {
          setConfig(data);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('chat.errors.loadCouncilConfigFailed'));
        setConfig(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(
    async (modelIds: string[], mode: 'auto' | 'manual') => {
      setError(null);
      try {
        const data = await apiPut<CouncilConfig>('/council/config', { modelIds, mode });
        setConfig(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('chat.errors.updateCouncilConfigFailed');
        setError(msg);
        throw new Error(msg);
      }
    },
    [t]
  );

  const deleteConfig = useCallback(async () => {
    setError(null);
    try {
      await apiDelete('/council/config');
      setConfig(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('chat.errors.deleteCouncilConfigFailed');
      setError(msg);
      throw new Error(msg);
    }
  }, [t]);

  return {
    config,
    loading,
    error,
    updateConfig,
    deleteConfig,
  };
}
