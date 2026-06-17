import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

export interface LatencyProvider {
  providerId: string;
  avgLatencyMs: number;
  requestCount: number;
}

export interface AdminLatency {
  period: string;
  providers: LatencyProvider[];
}

export interface CostRow {
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  estimatedCostUsd: number;
}

export interface CostByProvider {
  providerId: string;
  totalCostUsd: number;
  totalTokens: number;
  requestCount: number;
}

export interface AdminCosts {
  period: string;
  totalCostUsd: number;
  byProvider: CostByProvider[];
  byModel: CostRow[];
}

export interface AdminAdoption {
  totalUsers: number;
  activeUsers: number;
  usersWithProviders: number;
  councilUsers: number;
  activationRate: number;
  providerConnectionRate: number;
  councilAdoptionRate: number;
}

export interface AdminRetention {
  activeLastWeek: number;
  activeThisWeek: number;
  retained: number;
  retentionRate: number;
}

export interface TokenRatioProvider {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  ratio: number;
  requestCount: number;
}

export interface AdminTokenRatio {
  period: string;
  providers: TokenRatioProvider[];
}

export interface TimeBucket {
  label: string;
  max: number;
  count: number;
}

export interface AdminTimeToFirstChat {
  averageHours: number;
  medianHours: number;
  totalUsersWithChat: number;
  buckets: TimeBucket[];
}

export interface CountryCount {
  country: string;
  count: number;
}

export interface TimezoneCount {
  timezone: string;
  count: number;
}

export interface AdminDemographics {
  countries: CountryCount[];
  timezones: TimezoneCount[];
}

interface AdminData {
  overview: AdminOverview | null;
  registrations: AdminRegistrations | null;
  activeUsers: AdminActiveUsers | null;
  usage: AdminUsage | null;
  modes: AdminModes | null;
  latency: AdminLatency | null;
  costs: AdminCosts | null;
  adoption: AdminAdoption | null;
  retention: AdminRetention | null;
  tokenRatio: AdminTokenRatio | null;
  timeToFirstChat: AdminTimeToFirstChat | null;
  demographics: AdminDemographics | null;
  loading: boolean;
  error: string | null;
  period: string;
  setPeriod: (period: string) => void;
}

/**
 * Fetches all admin metrics in parallel. Re-fetches when the period changes.
 */
export function useAdminData(): AdminData {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('30d');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [registrations, setRegistrations] = useState<AdminRegistrations | null>(null);
  const [activeUsers, setActiveUsers] = useState<AdminActiveUsers | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [modes, setModes] = useState<AdminModes | null>(null);
  const [latency, setLatency] = useState<AdminLatency | null>(null);
  const [costs, setCosts] = useState<AdminCosts | null>(null);
  const [adoption, setAdoption] = useState<AdminAdoption | null>(null);
  const [retention, setRetention] = useState<AdminRetention | null>(null);
  const [tokenRatio, setTokenRatio] = useState<AdminTokenRatio | null>(null);
  const [timeToFirstChat, setTimeToFirstChat] = useState<AdminTimeToFirstChat | null>(null);
  const [demographics, setDemographics] = useState<AdminDemographics | null>(null);
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
          apiGet<AdminLatency>(`/admin/metrics/latency?period=${period}`),
          apiGet<AdminCosts>(`/admin/metrics/costs?period=${period}`),
          apiGet<AdminAdoption>('/admin/metrics/adoption'),
          apiGet<AdminRetention>('/admin/metrics/retention'),
          apiGet<AdminTokenRatio>(`/admin/metrics/token-ratio?period=${period}`),
          apiGet<AdminTimeToFirstChat>('/admin/metrics/time-to-first-chat'),
          apiGet<AdminDemographics>('/admin/metrics/demographics'),
        ]);
        if (cancelled) return;
        setOverview(results[0]);
        setRegistrations(results[1]);
        setActiveUsers(results[2]);
        setUsage(results[3]);
        setModes(results[4]);
        setLatency(results[5]);
        setCosts(results[6]);
        setAdoption(results[7]);
        setRetention(results[8]);
        setTokenRatio(results[9]);
        setTimeToFirstChat(results[10]);
        setDemographics(results[11]);
      } catch {
        if (cancelled) return;
        setError(t('chat.errors.loadAdminMetricsFailed'));
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
  }, [period, t]);

  return {
    overview,
    registrations,
    activeUsers,
    usage,
    modes,
    latency,
    costs,
    adoption,
    retention,
    tokenRatio,
    timeToFirstChat,
    demographics,
    loading,
    error,
    period,
    setPeriod,
  };
}
