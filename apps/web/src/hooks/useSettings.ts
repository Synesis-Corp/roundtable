import { storage } from '../lib/storage';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { UserProvider } from '@chat/sdk';
import { apiGet, apiPost, apiDelete } from '../lib/api-client';
import { clearIsNewFlag } from '../lib/onboarding-helpers';
import { emitProvidersChanged } from '../lib/provider-events';

export interface UseSettingsReturn {
  userProviders: UserProvider[];
  userProvidersLoading: boolean;
  userProviderMap: Map<string, UserProvider>;
  saveMessages: Record<string, { text: string; type: 'success' | 'error' }>;
  saving: Record<string, boolean>;
  testing: Record<string, boolean>;
  codexConnecting: boolean;
  codexNotice: { text: string; type: 'success' | 'error' } | null;
  pendingDisconnect: { providerId: string; name: string } | null;
  fetchUserProviders: () => void;
  testConnection: (providerId: string, apiKey: string) => Promise<void>;
  handleConnect: (
    providerId: string,
    apiKey: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
  requestDisconnect: (providerId: string) => void;
  handleDisconnectConfirmed: () => Promise<void>;
  setPendingDisconnect: React.Dispatch<
    React.SetStateAction<{ providerId: string; name: string } | null>
  >;
  handleCodexStart: () => Promise<void>;
  setSaveMessages: React.Dispatch<
    React.SetStateAction<Record<string, { text: string; type: 'success' | 'error' }>>
  >;
  setCodexNotice: React.Dispatch<
    React.SetStateAction<{ text: string; type: 'success' | 'error' } | null>
  >;
}

export function useSettings(): UseSettingsReturn {
  const token = storage.get('token');

  const [userProviders, setUserProviders] = useState<UserProvider[]>([]);
  const [userProvidersLoading, setUserProvidersLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveMessages, setSaveMessages] = useState<
    Record<string, { text: string; type: 'success' | 'error' }>
  >({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexNotice, setCodexNotice] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<{
    providerId: string;
    name: string;
  } | null>(null);

  const userProviderMap = useMemo(() => {
    const map = new Map<string, UserProvider>();
    for (const up of userProviders) {
      map.set(up.providerId, up);
    }
    return map;
  }, [userProviders]);

  const fetchUserProviders = useCallback(() => {
    if (!token) {
      setUserProvidersLoading(false);
      return;
    }
    setUserProvidersLoading(true);
    apiGet<UserProvider[]>('/providers')
      .then((data) => setUserProviders(data ?? []))
      .catch(() => setUserProviders([]))
      .finally(() => setUserProvidersLoading(false));
  }, [token]);

  useEffect(() => {
    fetchUserProviders();
  }, [fetchUserProviders]);

  // Codex OAuth callback parsing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codex = params.get('codex');
    if (codex === 'connected') {
      setCodexNotice({ text: 'OpenAI connected with ChatGPT Plus/Pro.', type: 'success' });
      window.history.replaceState({}, '', '/settings');
      // Onboarding Fase 2.1 (2026-06-14): Codex callback created a server-side
      // provider, so the connected-model list has changed. Notify subscribers.
      emitProvidersChanged();
    }
    if (codex === 'error') {
      setCodexNotice({ text: 'OpenAI Codex login failed. Try again.', type: 'error' });
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const testConnection = useCallback(
    async (providerId: string, apiKey: string) => {
      if (!token || !apiKey) return;

      setTesting((prev) => ({ ...prev, [providerId]: true }));
      setSaveMessages((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });

      try {
        const data = await apiPost<{ success: boolean; error?: string }>(
          '/providers/test-connection',
          { providerId, apiKey: apiKey || undefined }
        );
        setSaveMessages((prev) => ({
          ...prev,
          [providerId]: {
            text: data.success ? 'Connection successful!' : data.error || 'Connection failed',
            type: data.success ? 'success' : 'error',
          },
        }));
      } catch (err) {
        setSaveMessages((prev) => ({
          ...prev,
          [providerId]: {
            text: err instanceof Error ? err.message : 'Network error during test',
            type: 'error',
          },
        }));
      } finally {
        setTesting((prev) => ({ ...prev, [providerId]: false }));
        setTimeout(() => {
          setSaveMessages((prev) => {
            const next = { ...prev };
            delete next[providerId];
            return next;
          });
        }, 4000);
      }
    },
    [token]
  );

  const handleConnect = useCallback(
    async (providerId: string, apiKey: string, options?: Record<string, unknown>) => {
      if (!token) return;

      setSaving((prev) => ({ ...prev, [providerId]: true }));
      setSaveMessages((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });

      try {
        await apiPost('/providers', {
          providerId,
          apiKey,
          options: options && Object.keys(options).length > 0 ? options : undefined,
        });
        clearIsNewFlag();
        setSaveMessages((prev) => ({
          ...prev,
          [providerId]: { text: 'Connected successfully!', type: 'success' },
        }));
        fetchUserProviders();
        // Onboarding Fase 2.1 (2026-06-14): notify useModels subscribers to refetch.
        emitProvidersChanged();
      } catch (err) {
        setSaveMessages((prev) => ({
          ...prev,
          [providerId]: {
            text: err instanceof Error ? err.message : 'Failed to connect',
            type: 'error',
          },
        }));
      } finally {
        setSaving((prev) => ({ ...prev, [providerId]: false }));
        setTimeout(() => {
          setSaveMessages((prev) => {
            const next = { ...prev };
            delete next[providerId];
            return next;
          });
        }, 4000);
      }
    },
    [token, fetchUserProviders]
  );

  const requestDisconnect = useCallback(
    (providerId: string) => {
      const up = userProviderMap.get(providerId);
      if (!up) return;
      setPendingDisconnect({ providerId, name: up.providerId });
    },
    [userProviderMap]
  );

  const handleDisconnectConfirmed = useCallback(async () => {
    if (!token || !pendingDisconnect) return;
    const { providerId } = pendingDisconnect;
    const up = userProviderMap.get(providerId);
    if (!up) {
      setPendingDisconnect(null);
      return;
    }

    setSaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      await apiDelete(`/providers/${up.id}`);
      setPendingDisconnect(null);
      fetchUserProviders();
      // Onboarding Fase 2.1 (2026-06-14): notify useModels subscribers to refetch.
      emitProvidersChanged();
    } catch {
      // keep dialog open so the user can retry
    } finally {
      setSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  }, [token, pendingDisconnect, userProviderMap, fetchUserProviders]);

  const handleCodexStart = useCallback(async () => {
    if (!token) return;
    setCodexConnecting(true);
    setCodexNotice(null);

    try {
      const data = await apiPost<{ authorizationUrl?: string }>(
        '/providers/openai/codex/start',
        {}
      );
      if (!data.authorizationUrl) {
        setCodexNotice({ text: 'Could not start Codex login', type: 'error' });
        return;
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setCodexNotice({
        text: err instanceof Error ? err.message : 'Network error starting Codex login',
        type: 'error',
      });
    } finally {
      setCodexConnecting(false);
    }
  }, [token]);

  return {
    userProviders,
    userProvidersLoading,
    userProviderMap,
    saveMessages,
    saving,
    testing,
    codexConnecting,
    codexNotice,
    fetchUserProviders,
    testConnection,
    handleConnect,
    pendingDisconnect,
    requestDisconnect,
    handleDisconnectConfirmed,
    setPendingDisconnect,
    handleCodexStart,
    setSaveMessages,
    setCodexNotice,
  };
}
