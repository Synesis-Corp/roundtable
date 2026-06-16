import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  type PieLabelRenderProps,
} from 'recharts';
import {
  useAdminData,
  type AdminOverview,
  type DailyCount,
  type AdminUsage,
  type ModeCount,
} from '../hooks/useAdminData';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const COLORS = ['#6f7bf2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function AdminKpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 transition-all hover:border-[var(--accent-line)]">
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </span>
      <div className="text-3xl font-bold text-[var(--text-1)] tabular-nums mt-2">{value}</div>
    </div>
  );
}

function AdminKPIs({ overview }: { overview: AdminOverview }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      <AdminKpiCard
        label={t('admin.kpi.totalUsers')}
        value={overview.totalUsers.toLocaleString()}
        accent="#6f7bf2"
      />
      <AdminKpiCard
        label={t('admin.kpi.activeToday')}
        value={overview.activeToday.toLocaleString()}
        accent="#10b981"
      />
      <AdminKpiCard
        label={t('admin.kpi.totalTokens')}
        value={formatTokens(overview.totalTokens)}
        accent="#f59e0b"
      />
      <AdminKpiCard
        label={t('admin.kpi.totalRequests')}
        value={overview.totalRequests.toLocaleString()}
        accent="#ef4444"
      />
      <AdminKpiCard
        label={t('admin.kpi.registeredToday')}
        value={overview.registeredToday.toLocaleString()}
        accent="#8b5cf6"
      />
    </div>
  );
}

function AdminRegistrationsChart({ data }: { data: DailyCount[] }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        {t('admin.chart.registrations')}
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--text-3)' }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="count"
            fill="#6f7bf2"
            radius={[4, 4, 0, 0]}
            name={t('admin.chart.registrations')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminActiveUsersChart({ data }: { data: DailyCount[] }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        {t('admin.chart.activeUsers')}
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--text-3)' }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name={t('admin.chart.activeUsers')}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminTokensChart({ data }: { data: AdminUsage }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        {t('admin.chart.tokensByProvider')}
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data.byProvider} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
          <YAxis
            type="category"
            dataKey="providerId"
            tick={{ fontSize: 11, fill: 'var(--text-3)' }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="totalTokens"
            fill="#f59e0b"
            radius={[0, 4, 4, 0]}
            name={t('admin.chart.tokens')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminModesChart({ data }: { data: ModeCount[] }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">{t('admin.chart.modes')}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="mode"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={(props: PieLabelRenderProps) => `${props.name}: ${props.value}`}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdminUsageTable({ usage }: { usage: AdminUsage }) {
  const { t } = useTranslation();

  if (usage.byModel.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <p className="text-sm text-[var(--text-3)]">{t('admin.table.empty')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden mb-8">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-3)] uppercase tracking-wider">
                {t('admin.table.provider')}
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-3)] uppercase tracking-wider">
                {t('admin.table.model')}
              </th>
              <th className="text-right px-5 py-3 text-xs font-medium text-[var(--text-3)] uppercase tracking-wider">
                {t('admin.table.tokens')}
              </th>
              <th className="text-right px-5 py-3 text-xs font-medium text-[var(--text-3)] uppercase tracking-wider">
                {t('admin.table.requests')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {usage.byModel.map((row) => (
              <tr key={`${row.providerId}-${row.modelId}`} className="hover:bg-[var(--bg-hover)]">
                <td className="px-5 py-3 text-sm text-[var(--text-1)]">{row.providerId}</td>
                <td className="px-5 py-3 text-sm font-mono text-[var(--text-2)]">{row.modelId}</td>
                <td className="px-5 py-3 text-sm text-right tabular-nums text-[var(--text-2)]">
                  {formatTokens(row.totalTokens)}
                </td>
                <td className="px-5 py-3 text-sm text-right tabular-nums text-[var(--text-2)]">
                  {row.totalRequests.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto" role="status" aria-live="polite">
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]" />
          <div className="h-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]" />
        </div>
      </div>
    </div>
  );
}

function AdminError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {t('admin.error.retry')}
        </button>
      </div>
    </div>
  );
}

function AdminEmpty() {
  const { t } = useTranslation();
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <p className="text-sm text-[var(--text-3)]">{t('admin.empty')}</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { overview, registrations, activeUsers, usage, modes, loading, error, period, setPeriod } =
    useAdminData();

  if (loading) return <AdminLoading />;
  if (error) return <AdminError error={error} onRetry={() => setPeriod(period)} />;
  if (!overview || overview.totalUsers === 0) return <AdminEmpty />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">{t('admin.title')}</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">{t('admin.subtitle')}</p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
          {(
            [
              { key: '30d', label: t('admin.period.days30') },
              { key: '90d', label: t('admin.period.days90') },
              { key: 'all', label: t('admin.period.total') },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: period === key ? 'var(--accent)' : 'transparent',
                color: period === key ? '#fff' : 'var(--text-3)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <AdminKPIs overview={overview} />

      {registrations && activeUsers && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminRegistrationsChart data={registrations.days} />
          <AdminActiveUsersChart data={activeUsers.days} />
        </div>
      )}

      {usage && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminTokensChart data={usage} />
          {modes && <AdminModesChart data={modes.modes} />}
        </div>
      )}

      {usage && <AdminUsageTable usage={usage} />}
    </div>
  );
}
