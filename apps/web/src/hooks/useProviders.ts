import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AvailableProvider } from '@chat/sdk';
import { apiGet } from '../lib/api-client';

interface UseProvidersReturn {
  providers: AvailableProvider[];
  popularProviders: AvailableProvider[];
  otherProviders: AvailableProvider[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProviders(): UseProvidersReturn {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AvailableProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(() => {
    setLoading(true);
    setError(null);

    apiGet<{ providers: AvailableProvider[] }>('/providers/available')
      .then((data) => {
        setProviders(data.providers ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('chat.errors.loadProvidersFailed'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const popularProviders = providers.filter((p) => p.popular);
  const otherProviders = providers.filter((p) => !p.popular);

  return {
    providers,
    popularProviders,
    otherProviders,
    loading,
    error,
    refetch: fetchProviders,
  };
}
