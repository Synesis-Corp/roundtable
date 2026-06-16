import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api-client';

export interface AdminOverview {
  totalUsers: number;
  activeToday: number;
  totalTokens: number;
  totalRequests: number;
  registeredToday: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface AdminRegistrations {
  period: string;
  days: DailyCount[];
}

export interface AdminActiveUsers {
  period: string;
  days: DailyCount[];
}

export interface ProviderUsage {
  providerId: string;
  totalTokens: number;
  totalRequests: number;
}

export interface ModelUsage {
  providerId: string;
  modelId: string;
  totalTokens: number;
  totalRequests: number;
}

export interface AdminUsage {
  period: string;
  byProvider: ProviderUsage[];
  byModel: ModelUsage[];
}

export interface ModeCount {
  mode: string;
  count: number;
}

export interface AdminModes {
  period: string;
  modes: ModeCount[];
}

interface AdminData {
  overview: AdminOverview | null;
  registrations: AdminRegistrations | null;
  activeUsers: AdminActiveUsers | null;
  usage: AdminUsage | null;
  modes: AdminModes | null;
  loading: boolean;
  error: string | null;
  period: string;
  setPeriod: (period: string) => void;
}

/**
 * Fetches all admin metrics in parallel. Re-fetches when the period changes.
 */
export function useAdminData(): AdminData {
  const [period, setPeriod] = useState('30d');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [registrations, setRegistrations] = useState<AdminRegistrations | null>(null);
  const [activeUsers, setActiveUsers] = useState<AdminActiveUsers | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [modes, setModes] = useState<AdminModes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          apiGet<AdminOverview>('/admin/metrics/overview'),
          apiGet<AdminRegistrations>(`/admin/metrics/registrations?period=${period}`),
          apiGet<AdminActiveUsers>(`/admin/metrics/active-users?period=${period}`),
          apiGet<AdminUsage>(`/admin/metrics/usage?period=${period}`),
          apiGet<AdminModes>(`/admin/metrics/modes?period=${period}`),
        ]);
        if (cancelled) return;
        setOverview(results[0]);
        setRegistrations(results[1]);
        setActiveUsers(results[2]);
        setUsage(results[3]);
        setModes(results[4]);
      } catch {
        if (cancelled) return;
        setError('Failed to load admin metrics');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return {
    overview,
    registrations,
    activeUsers,
    usage,
    modes,
    loading,
    error,
    period,
    setPeriod,
  };
}
