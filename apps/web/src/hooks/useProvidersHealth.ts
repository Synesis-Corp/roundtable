import { useState, useEffect, useCallback } from "react";
import { apiGet } from "../lib/api-client";

/** Live health of one connected provider (mirrors the backend shape). */
export interface ProviderHealth {
  ok: boolean;
  error?: string;
  checkedAt: number;
}

interface UseProvidersHealthReturn {
  health: Record<string, ProviderHealth>;
  loading: boolean;
  refetch: () => void;
}

/**
 * Fetches `GET /providers/health` — a per-provider liveness map. The backend
 * caches each probe ~60s, so it's safe to call on every Providers-tab mount.
 * A failed request degrades to an empty map (rows just show no dot).
 */
export function useProvidersHealth(): UseProvidersHealthReturn {
  const [health, setHealth] = useState<Record<string, ProviderHealth>>({});
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(() => {
    setLoading(true);
    apiGet<{ health: Record<string, ProviderHealth> }>("/providers/health")
      .then((data) => setHealth(data.health ?? {}))
      .catch(() => setHealth({}))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return { health, loading, refetch: fetchHealth };
}
