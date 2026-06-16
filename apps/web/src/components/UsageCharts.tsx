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
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { UsageRow } from '../lib/usage-helpers';
import { getProviderColor, formatTokens, formatLatency, formatCost } from '../lib/usage-helpers';

/** Aggregated per-provider datum the bar chart consumes. */
export interface ProviderDatum {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  requestCount: number;
  fill: string;
}

interface PieDatum {
  name: string;
  value: number;
  fill: string;
}

export function ScatterTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: UsageRow; name?: string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: '8px 12px',
        fontSize: '12px',
        color: 'var(--text-1)',
        lineHeight: 1.5,
        minWidth: '160px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-1)' }}>
        {p.displayName || `${p.providerId} · ${p.modelId}`}
      </div>
      <div style={{ color: 'var(--text-2)' }}>
        Latencia: <span style={{ color: 'var(--text-1)' }}>{formatLatency(p.avgLatencyMs)}</span>
      </div>
      <div style={{ color: 'var(--text-2)' }}>
        Tokens: <span style={{ color: 'var(--text-1)' }}>{formatTokens(p.totalTokens)}</span>
      </div>
      <div style={{ color: 'var(--text-2)' }}>
        Requests: <span style={{ color: 'var(--text-1)' }}>{p.requestCount}</span>
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">{title}</h3>
      {children}
    </div>
  );
}

/** Stacked input/output tokens per provider. */
export function TokensByProviderChart({ providerData }: { providerData: ProviderDatum[] }) {
  return (
    <ChartCard title="Tokens por proveedor">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={providerData} barGap={0} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="providerId"
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTokens}
          />
          <Tooltip
            cursor={{ fill: 'var(--hover)' }}
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            itemStyle={{ color: 'var(--text-1)', fontSize: 13 }}
            formatter={(value: unknown, name: unknown) => {
              const num = typeof value === 'number' ? value : 0;
              return [formatTokens(num), String(name ?? '')];
            }}
            labelStyle={{ color: 'var(--text-2)', marginBottom: '4px' }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: 'var(--text-2)', paddingTop: '16px' }}
          />
          <Bar dataKey="inputTokens" name="Input" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
          <Bar dataKey="outputTokens" name="Output" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Cost distribution donut by provider. */
export function CostDistributionChart({ pieData }: { pieData: PieDatum[] }) {
  return (
    <ChartCard title="Distribución de costo">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="40%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            strokeWidth={0}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
            formatter={(value: unknown, name: unknown) => {
              const num = typeof value === 'number' ? value : 0;
              return [formatCost(num), String(name)];
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: 'var(--text-2)', lineHeight: '24px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Latency vs tokens scatter; point size encodes request volume. */
export function LatencyScatterChart({ rows }: { rows: UsageRow[] }) {
  return (
    <ChartCard title="Latencia vs Tokens (tamaño del punto = requests)" className="mb-8">
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="totalTokens"
            name="Tokens"
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            tickFormatter={formatTokens}
            label={{
              value: 'Tokens',
              position: 'insideBottom',
              offset: -5,
              fill: 'var(--text-3)',
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="avgLatencyMs"
            name="Latencia"
            tick={{ fill: 'var(--text-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatLatency}
            label={{
              value: 'Latencia',
              angle: -90,
              position: 'insideLeft',
              fill: 'var(--text-3)',
              fontSize: 12,
            }}
          />
          <ZAxis type="number" dataKey="requestCount" range={[60, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: 'var(--border)' }}
            content={<ScatterTooltipContent />}
          />
          {Array.from(new Set(rows.map((r) => r.providerId))).map((providerId) => (
            <Scatter
              key={providerId}
              name={providerId}
              data={rows.filter((r) => r.providerId === providerId)}
              fill={getProviderColor(providerId)}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
