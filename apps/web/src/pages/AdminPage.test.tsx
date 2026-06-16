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

const sampleOverview = {
  totalUsers: 42,
  activeToday: 7,
  totalTokens: 1500000,
  totalRequests: 340,
  registeredToday: 2,
};

const sampleRegistrations = {
  period: '30d',
  days: [
    { date: '2026-06-01', count: 3 },
    { date: '2026-06-02', count: 1 },
  ],
};

const sampleActiveUsers = {
  period: '30d',
  days: [
    { date: '2026-06-01', count: 5 },
    { date: '2026-06-02', count: 2 },
  ],
};

const sampleUsage = {
  period: '30d',
  byProvider: [{ providerId: 'openai', totalTokens: 8000, totalRequests: 10 }],
  byModel: [{ providerId: 'openai', modelId: 'gpt-4o', totalTokens: 8000, totalRequests: 10 }],
};

const sampleModes = {
  period: '30d',
  modes: [
    { mode: 'single', count: 200 },
    { mode: 'council', count: 30 },
  ],
};

function mockAllSuccess() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('overview')) return Promise.resolve(sampleOverview);
    if (url.includes('registrations')) return Promise.resolve(sampleRegistrations);
    if (url.includes('active-users')) return Promise.resolve(sampleActiveUsers);
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
    expect(screen.getByText('Active Today')).toBeInTheDocument();
  });

  it('renders charts after data loads', async () => {
    mockAllSuccess();

    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText('Registrations per Day')).toBeInTheDocument());

    expect(screen.getByText('Active Users per Day')).toBeInTheDocument();
    expect(screen.getByText('Tokens by Provider')).toBeInTheDocument();
    expect(screen.getByText('Single vs Council')).toBeInTheDocument();
  });

  it('shows error state on failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Failed'));

    render(<AdminPage />);

    await waitFor(() =>
      expect(screen.getByText('Failed to load admin metrics')).toBeInTheDocument()
    );
  });

  it('shows empty state when totalUsers is 0', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('overview')) return Promise.resolve({ ...sampleOverview, totalUsers: 0 });
      if (url.includes('registrations')) return Promise.resolve(sampleRegistrations);
      if (url.includes('active-users')) return Promise.resolve(sampleActiveUsers);
      if (url.includes('modes')) return Promise.resolve(sampleModes);
      if (url.includes('usage')) return Promise.resolve(sampleUsage);
      return Promise.reject(new Error('Unknown endpoint'));
    });

    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText(/No data available yet/)).toBeInTheDocument());
  });

  it('renders usage table with model rows', async () => {
    mockAllSuccess();

    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText('gpt-4o')).toBeInTheDocument());
    expect(screen.getByText('openai')).toBeInTheDocument();
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
