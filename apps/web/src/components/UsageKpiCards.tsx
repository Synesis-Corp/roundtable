import type { UsageTotals } from '../lib/usage-helpers';
import { formatCost, formatTokens, formatLatency } from '../lib/usage-helpers';
import { Icons } from '../lib/usage-icons';

function KpiCard({
  label,
  value,
  icon,
  accent,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 transition-all hover:border-[var(--accent-line)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: accent + '20', color: accent }}>
          {icon}
        </div>
        <span className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-[var(--text-1)] tabular-nums">{value}</div>
      {detail && <div className="text-xs text-[var(--text-4)] mt-1.5">{detail}</div>}
    </div>
  );
}

interface UsageKpiCardsProps {
  totals: UsageTotals;
  tokensPerRequest: number;
  hasEstimatedCosts: boolean;
}

/** The four headline KPI cards (cost, tokens, requests, latency). */
export function UsageKpiCards({ totals, tokensPerRequest, hasEstimatedCosts }: UsageKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <KpiCard
        label="Costo estimado"
        value={formatCost(totals.totalCostUsd)}
        icon={Icons.dollar}
        accent="var(--accent)"
        detail={hasEstimatedCosts ? 'Incluye estimaciones' : undefined}
      />
      <KpiCard
        label="Total de tokens"
        value={formatTokens(totals.totalTokens)}
        icon={Icons.tokens}
        accent="#8b5cf6"
        detail={`${formatTokens(totals.inputTokens)} in / ${formatTokens(totals.outputTokens)} out`}
      />
      <KpiCard
        label="Requests"
        value={totals.totalRequests.toLocaleString()}
        icon={Icons.chart}
        accent="#10b981"
        detail={`~${tokensPerRequest.toLocaleString()} tokens/req`}
      />
      <KpiCard
        label="Latencia promedio"
        value={formatLatency(totals.avgLatencyMs)}
        icon={Icons.lightning}
        accent="#f59e0b"
        detail={totals.avgLatencyMs > 1000 ? 'Lento' : 'Rápido'}
      />
    </div>
  );
}
