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
  type AdminLatency,
  type AdminCosts,
  type AdminAdoption,
  type AdminRetention,
  type AdminTokenRatio,
  type AdminTimeToFirstChat,
  type AdminDemographics,
} from '../hooks/useAdminData';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}

function formatHours(n: number): string {
  if (n < 1) return '< 1h';
  if (n < 24) return `${n}h`;
  return `${Math.round(n / 24)}d`;
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

function AdminSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function AdminKPIs({
  overview,
  adoption,
}: {
  overview: AdminOverview;
  adoption?: AdminAdoption | null;
}) {
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
      {adoption && (
        <>
          <AdminKpiCard
            label={t('admin.kpi.activationRate')}
            value={`${adoption.activationRate}%`}
            accent="#06b6d4"
          />
          <AdminKpiCard
            label={t('admin.kpi.providerConnectionRate')}
            value={`${adoption.providerConnectionRate}%`}
            accent="#06b6d4"
          />
          <AdminKpiCard
            label={t('admin.kpi.councilAdoption')}
            value={`${adoption.councilAdoptionRate}%`}
            accent="#06b6d4"
          />
        </>
      )}
    </div>
  );
}

function AdminRegistrationsChart({ data }: { data: DailyCount[] }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.registrations')}>
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
    </AdminSection>
  );
}

function AdminActiveUsersChart({ data }: { data: DailyCount[] }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.activeUsers')}>
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
    </AdminSection>
  );
}

function AdminTokensChart({ data }: { data: AdminUsage }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.tokensByProvider')}>
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
    </AdminSection>
  );
}

function AdminModesChart({ data }: { data: ModeCount[] }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.modes')}>
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
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
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
    </AdminSection>
  );
}

function AdminLatencyChart({ data }: { data: AdminLatency }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.latency')}>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data.providers} layout="vertical">
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
            formatter={(value: unknown) => [formatMs(Number(value)), t('admin.chart.avgLatency')]}
          />
          <Bar
            dataKey="avgLatencyMs"
            fill="#ef4444"
            radius={[0, 4, 4, 0]}
            name={t('admin.chart.avgLatency')}
          />
        </BarChart>
      </ResponsiveContainer>
    </AdminSection>
  );
}

function AdminCostChart({ data }: { data: AdminCosts }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.costs')}>
      <div className="text-2xl font-bold text-[var(--text-1)] mb-4">
        {formatCost(data.totalCostUsd)}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.byModel.slice(0, 10)} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
          <YAxis
            type="category"
            dataKey="modelId"
            tick={{ fontSize: 10, fill: 'var(--text-3)' }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: unknown) => [
              formatCost(Number(value)),
              t('admin.chart.estimatedCost'),
            ]}
          />
          <Bar
            dataKey="estimatedCostUsd"
            fill="#f59e0b"
            radius={[0, 4, 4, 0]}
            name={t('admin.chart.estimatedCost')}
          />
        </BarChart>
      </ResponsiveContainer>
    </AdminSection>
  );
}

function AdminTokenRatioChart({ data }: { data: AdminTokenRatio }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.tokenRatio')}>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data.providers} layout="vertical">
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
            formatter={(value: unknown) => [`${value}:1`, t('admin.chart.inputOutputRatio')]}
          />
          <Bar
            dataKey="ratio"
            fill="#8b5cf6"
            radius={[0, 4, 4, 0]}
            name={t('admin.chart.inputOutputRatio')}
          />
        </BarChart>
      </ResponsiveContainer>
    </AdminSection>
  );
}

function AdminTimeToFirstChatSection({ data }: { data: AdminTimeToFirstChat }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.timeToFirstChat')}>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-1)]">
            {formatHours(data.averageHours)}
          </div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.averageTime')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-1)]">
            {formatHours(data.medianHours)}
          </div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.medianTime')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-1)]">{data.totalUsersWithChat}</div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.usersWithChat')}</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.buckets}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
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
            fill="#06b6d4"
            radius={[4, 4, 0, 0]}
            name={t('admin.kpi.usersWithChat')}
          />
        </BarChart>
      </ResponsiveContainer>
    </AdminSection>
  );
}

function AdminRetentionSection({ data }: { data: AdminRetention }) {
  const { t } = useTranslation();
  return (
    <AdminSection title={t('admin.chart.retention')}>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-1)]">{data.activeLastWeek}</div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.activeLastWeek')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-1)]">{data.activeThisWeek}</div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.activeThisWeek')}</div>
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-bold text-[var(--text-1)]"
            style={{ color: data.retentionRate >= 50 ? '#10b981' : '#ef4444' }}
          >
            {data.retentionRate}%
          </div>
          <div className="text-xs text-[var(--text-3)]">{t('admin.kpi.retentionRate')}</div>
        </div>
      </div>
    </AdminSection>
  );
}

function AdminDemographicsSection({ data }: { data: AdminDemographics }) {
  const { t } = useTranslation();

  if (data.countries.length === 0 && data.timezones.length === 0) return null;

  return (
    <AdminSection title={t('admin.chart.demographics')}>
      {data.countries.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-[var(--text-3)] mb-2">{t('admin.chart.countries')}</p>
          <div className="flex flex-wrap gap-2">
            {data.countries.slice(0, 10).map((c) => (
              <span
                key={c.country}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--hover)', color: 'var(--text-2)' }}
              >
                {c.country} ({c.count})
              </span>
            ))}
          </div>
        </div>
      )}
      {data.timezones.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-3)] mb-2">{t('admin.chart.timezones')}</p>
          <div className="flex flex-wrap gap-2">
            {data.timezones.slice(0, 10).map((tz) => (
              <span
                key={tz.timezone}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--hover)', color: 'var(--text-2)' }}
              >
                {tz.timezone} ({tz.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </AdminSection>
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

function AdminCostTable({ costs }: { costs: AdminCosts }) {
  const { t } = useTranslation();

  if (costs.byModel.length === 0) return null;

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
                {t('admin.table.cost')}
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
            {costs.byModel.map((row) => (
              <tr key={`${row.providerId}-${row.modelId}`} className="hover:bg-[var(--bg-hover)]">
                <td className="px-5 py-3 text-sm text-[var(--text-1)]">{row.providerId}</td>
                <td className="px-5 py-3 text-sm font-mono text-[var(--text-2)]">{row.modelId}</td>
                <td className="px-5 py-3 text-sm text-right tabular-nums text-[var(--text-2)]">
                  {formatCost(row.estimatedCostUsd)}
                </td>
                <td className="px-5 py-3 text-sm text-right tabular-nums text-[var(--text-2)]">
                  {formatTokens(row.totalTokens)}
                </td>
                <td className="px-5 py-3 text-sm text-right tabular-nums text-[var(--text-2)]">
                  {row.requestCount.toLocaleString()}
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
  const {
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
  } = useAdminData();

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

      <AdminKPIs overview={overview} adoption={adoption} />

      {registrations && activeUsers && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminRegistrationsChart data={registrations.days} />
          <AdminActiveUsersChart data={activeUsers.days} />
        </div>
      )}

      {usage && modes && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminTokensChart data={usage} />
          <AdminModesChart data={modes.modes} />
        </div>
      )}

      {latency && tokenRatio && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminLatencyChart data={latency} />
          <AdminTokenRatioChart data={tokenRatio} />
        </div>
      )}

      {costs && <AdminCostChart data={costs} />}

      {retention && timeToFirstChat && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminRetentionSection data={retention} />
          <AdminTimeToFirstChatSection data={timeToFirstChat} />
        </div>
      )}

      {demographics && <AdminDemographicsSection data={demographics} />}

      {usage && <AdminUsageTable usage={usage} />}
      {costs && <AdminCostTable costs={costs} />}
    </div>
  );
}
