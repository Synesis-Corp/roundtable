import type { UsageRow } from '../lib/usage-helpers';
import { getProviderColor, formatCost, formatLatency } from '../lib/usage-helpers';
import { Icons } from '../lib/usage-icons';

interface UsageTableProps {
  rows: UsageRow[];
  hasEstimatedCosts: boolean;
}

/** Per-model detail table with input/output/total tokens, requests, cost, latency. */
export function UsageTable({ rows, hasEstimatedCosts }: UsageTableProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Detalle por modelo</h3>
          {hasEstimatedCosts && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{
                backgroundColor: 'var(--accent-quiet)',
                color: 'var(--accent-text)',
                border: '1px solid var(--accent-line)',
              }}
              title="Algunos costos son estimados porque no hay breakdown de input/output"
            >
              {Icons.info}
              <span>Estimado</span>
            </div>
          )}
        </div>
        <span className="text-xs text-[var(--text-3)]">
          {rows.length} {rows.length === 1 ? 'modelo' : 'modelos'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {['Provider', 'Modelo', 'Input', 'Output', 'Total', 'Reqs', 'Costo', 'Latencia'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-[var(--text-3)] uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <tr
                key={`${row.providerId}-${row.modelId}`}
                className="group hover:bg-[var(--hover)] transition-colors"
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getProviderColor(row.providerId) }}
                    />
                    <span className="text-sm font-medium text-[var(--text-1)]">
                      {row.providerId}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-[var(--text-2)]">{row.modelId}</td>
                <td className="px-6 py-3 text-sm text-[var(--text-2)] tabular-nums">
                  {row.inputTokens.toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm text-[var(--text-2)] tabular-nums">
                  {row.outputTokens.toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm font-medium text-[var(--text-1)] tabular-nums">
                  {row.totalTokens.toLocaleString()}
                </td>
                <td className="px-6 py-3 text-sm text-[var(--text-2)] tabular-nums">
                  {row.requestCount}
                </td>
                <td
                  className="px-6 py-3 text-sm font-medium tabular-nums"
                  style={{ color: 'var(--accent)' }}
                >
                  <div className="flex items-center gap-1.5">
                    {formatCost(row.estimatedCostUsd)}
                    {!row.hasBreakdown && row.estimatedCostUsd > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: 'var(--text-4)' }}
                        title="Costo estimado (sin breakdown de input/output)"
                      />
                    )}
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-[var(--text-2)] tabular-nums">
                  {formatLatency(row.avgLatencyMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
