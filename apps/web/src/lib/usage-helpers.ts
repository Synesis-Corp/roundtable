/**
 * Pure helpers, types and constants for the Usage dashboard.
 * No React, no side effects — testable in isolation.
 */

export interface UsageRow {
  providerId: string;
  modelId: string;
  displayName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  avgLatencyMs: number;
  estimatedCostUsd: number;
  hasBreakdown: boolean;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalRequests: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

export interface UsageResponse {
  period: string;
  rows: UsageRow[];
  totals: UsageTotals;
  insights: string[];
}

export const CHART_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

export const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  google: '#4285f4',
  deepseek: '#4f46e5',
  mistral: '#ff7000',
  groq: '#f55036',
  cohere: '#d4a27f',
  perplexity: '#22d3ee',
  xai: '#1d9bf0',
  openrouter: '#ff692e',
  fireworks: '#ff4d4d',
  togetherai: '#8b5cf6',
  azure: '#0078d4',
  minimax: '#00d4aa',
};

export function getProviderColor(providerId: string): string {
  return PROVIDER_COLORS[providerId] || CHART_COLORS[0];
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

// Council aggregates real spend under a virtual provider id; the user opted into
// it explicitly, so it stays visible even though it's not a configured provider.
export const ALWAYS_VISIBLE_PROVIDERS = new Set(['council']);

// When we hide rows from disconnected providers, the backend totals (computed
// over ALL rows) would overstate cost/tokens. Recompute totals from the visible
// rows so the KPIs match exactly what the table shows.
export function computeTotals(rows: UsageRow[]): UsageTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let totalRequests = 0;
  let totalCostUsd = 0;
  let weightedLatency = 0;
  for (const row of rows) {
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    totalTokens += row.totalTokens;
    totalRequests += row.requestCount;
    totalCostUsd += row.estimatedCostUsd;
    weightedLatency += row.avgLatencyMs * row.requestCount;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    totalRequests,
    totalCostUsd,
    avgLatencyMs: totalRequests > 0 ? Math.round(weightedLatency / totalRequests) : 0,
  };
}
