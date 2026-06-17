import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api-client';
import { storage } from '../lib/storage';

export interface MemoryItem {
  id: string;
  userId: string;
  content: string;
  sourceType: string | null;
  sourceConversationId?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface UseMemoryReturn {
  memories: MemoryItem[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  deletingId: string | null;
  memoryEnabled: boolean;
  setMemoryEnabled: (enabled: boolean) => void;
  createMemory: (content: string, tags: string[]) => Promise<MemoryItem>;
  updateMemory: (id: string, content: string, tags: string[]) => Promise<MemoryItem>;
  deleteMemory: (id: string) => Promise<void>;
  refetch: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useMemory(): UseMemoryReturn {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabledState] = useState(
    () => storage.get('memoryEnabled') !== 'false'
  );

  const refetch = useCallback(() => {
    if (!storage.get('token')) {
      setMemories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    apiGet<MemoryItem[]>('/memory')
      .then((data) => setMemories(Array.isArray(data) ? data : []))
      .catch((requestError) => {
        setError(errorMessage(requestError, t('chat.errors.loadMemoriesFailed')));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setMemoryEnabled = useCallback((enabled: boolean) => {
    storage.set('memoryEnabled', String(enabled));
    setMemoryEnabledState(enabled);
  }, []);

  const createMemory = useCallback(
    async (content: string, tags: string[]) => {
      setSaving(true);
      setError(null);
      try {
        const created = await apiPost<MemoryItem>('/memory', { content, tags });
        setMemories((current) => [created, ...current]);
        return created;
      } catch (requestError) {
        setError(errorMessage(requestError, t('chat.errors.saveMemoryFailed')));
        throw requestError;
      } finally {
        setSaving(false);
      }
    },
    [t]
  );

  const updateMemory = useCallback(
    async (id: string, content: string, tags: string[]) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await apiPatch<MemoryItem>(`/memory/${encodeURIComponent(id)}`, {
          content,
          tags,
        });
        setMemories((current) => current.map((item) => (item.id === id ? updated : item)));
        return updated;
      } catch (requestError) {
        setError(errorMessage(requestError, t('chat.errors.updateMemoryFailed')));
        throw requestError;
      } finally {
        setSaving(false);
      }
    },
    [t]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      try {
        await apiDelete(`/memory/${encodeURIComponent(id)}`);
        setMemories((current) => current.filter((item) => item.id !== id));
      } catch (requestError) {
        setError(errorMessage(requestError, t('chat.errors.deleteMemoryFailed')));
        throw requestError;
      } finally {
        setDeletingId(null);
      }
    },
    [t]
  );

  return {
    memories,
    loading,
    error,
    saving,
    deletingId,
    memoryEnabled,
    setMemoryEnabled,
    createMemory,
    updateMemory,
    deleteMemory,
    refetch,
  };
}
