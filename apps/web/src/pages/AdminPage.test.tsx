import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPage from './AdminPage';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('../lib/api-client', () => ({
  apiGet: mockApiGet,
}));

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    PieChart: Passthrough,
    Pie: () => null,
    Cell: () => null,
    LineChart: Passthrough,
    Line: () => null,
  };
});

const sampleOverview = { totalUsers: 42, activeToday: 7, totalTokens: 1500000, totalRequests: 340, registeredToday: 2 };
const sampleRegistrations = { period: '30d', days: [{ date: '2026-06-01', count: 3 }] };
const sampleActiveUsers = { period: '30d', days: [{ date: '2026-06-01', count: 5 }] };
const sampleUsage = { period: '30d', byProvider: [{ providerId: 'openai', totalTokens: 8000, totalRequests: 10 }], byModel: [{ providerId: 'openai', modelId: 'gpt-4o', totalTokens: 8000, totalRequests: 10 }] };
const sampleModes = { period: '30d', modes: [{ mode: 'single', count: 200 }, { mode: 'council', count: 30 }] };
const sampleLatency = { period: '30d', providers: [{ providerId: 'openai', avgLatencyMs: 250, requestCount: 10 }] };
const sampleCosts = { period: '30d', totalCostUsd: 2.5, byProvider: [{ providerId: 'openai', totalCostUsd: 2.5, totalTokens: 8000, requestCount: 10 }], byModel: [{ providerId: 'openai', modelId: 'gpt-4o', inputTokens: 0, outputTokens: 0, totalTokens: 8000, requestCount: 10, estimatedCostUsd: 2.5 }] };
const sampleAdoption = { totalUsers: 42, activeUsers: 30, usersWithProviders: 20, councilUsers: 5, activationRate: 71, providerConnectionRate: 48, councilAdoptionRate: 17 };
const sampleRetention = { activeLastWeek: 20, activeThisWeek: 25, retained: 15, retentionRate: 75 };
const sampleTokenRatio = { period: '30d', providers: [{ providerId: 'openai', inputTokens: 5000, outputTokens: 3000, ratio: 1.67, requestCount: 10 }] };
const sampleTimeToFirstChat = { averageHours: 2, medianHours: 1, totalUsersWithChat: 30, buckets: [{ label: '< 1 hour', max: 1, count: 20 }, { label: '< 24 hours', max: 24, count: 8 }, { label: '> 24 hours', max: Infinity, count: 2 }] };
const sampleDemographics = { countries: [{ country: 'AR', count: 10 }, { country: 'US', count: 5 }], timezones: [{ timezone: 'America/Argentina/Buenos_Aires', count: 10 }] };

function mockAllSuccess() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('overview')) return Promise.resolve(sampleOverview);
    if (url.includes('registrations')) return Promise.resolve(sampleRegistrations);
    if (url.includes('active-users')) return Promise.resolve(sampleActiveUsers);
    if (url.includes('latency')) return Promise.resolve(sampleLatency);
    if (url.includes('costs')) return Promise.resolve(sampleCosts);
    if (url.includes('adoption')) return Promise.resolve(sampleAdoption);
    if (url.includes('retention')) return Promise.resolve(sampleRetention);
    if (url.includes('token-ratio')) return Promise.resolve(sampleTokenRatio);
    if (url.includes('time-to-first-chat')) return Promise.resolve(sampleTimeToFirstChat);
    if (url.includes('demographics')) return Promise.resolve(sampleDemographics);
    if (url.includes('modes')) return Promise.resolve(sampleModes);
    if (url.includes('usage')) return Promise.resolve(sampleUsage);
    return Promise.reject(new Error('Unknown endpoint'));
  });
}

describe('AdminPage', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    mockApiGet.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows loading state initially', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}));
    render(<AdminPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders KPIs after data loads', async () => {
    mockAllSuccess();
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText('Total Users')).toBeInTheDocument();
  });

  it('renders charts after data loads', async () => {
    mockAllSuccess();
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Registrations per Day')).toBeInTheDocument());
  });

  it('shows error state on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Failed'));
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText('Failed to load admin metrics')).toBeInTheDocument());
  });

  it('shows empty state when totalUsers is 0', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('overview')) return Promise.resolve({ totalUsers: 0, activeToday: 0, totalTokens: 0, totalRequests: 0, registeredToday: 0 });
      return Promise.resolve(sampleRegistrations);
    });
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText(/No data available yet/)).toBeInTheDocument());
  });

  it('renders usage table with model rows', async () => {
    mockAllSuccess();
    render(<AdminPage />);
    await waitFor(() => {
      const cells = screen.getAllByText('gpt-4o');
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });
    const openaiCells = screen.getAllByText('openai');
    expect(openaiCells.length).toBeGreaterThanOrEqual(1);
  });

  it('changes period when button clicked', async () => {
    mockAllSuccess();
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    fireEvent.click(screen.getByText('90 days'));
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('period=90d'));
    });
  });
});
