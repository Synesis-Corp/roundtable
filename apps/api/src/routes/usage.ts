/**
 * Usage dashboard endpoint.
 *
 * Aggregates independent UsageEvent rows by provider + model, computing token
 * counts, request counts, average latency, and estimated cost.
 */

import { Router } from 'express';
import { prisma } from '../lib/db';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { getModelPrice, calculateCost } from '../lib/model-pricing';
import { getDailyUsageHeatmap } from '../lib/usage-heatmap';

const router = Router();

interface UsageRow {
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

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalRequests: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

function computeInsights(rows: UsageRow[], totals: UsageTotals): string[] {
  if (rows.length === 0) return [];

  const insights: string[] = [];

  // Top model by tokens
  const topModel = rows.reduce((max, row) => (row.totalTokens > max.totalTokens ? row : max));
  const topModelPct =
    totals.totalTokens > 0 ? Math.round((topModel.totalTokens / totals.totalTokens) * 100) : 0;
  insights.push(`${topModel.modelId} es tu modelo más usado (${topModelPct}% de los tokens)`);

  // Best cost/request ratio
  const bestRatio = rows
    .filter((r) => r.requestCount > 0)
    .reduce(
      (best, row) => {
        const ratio = row.estimatedCostUsd / row.requestCount;
        return ratio < best.ratio ? { provider: row.providerId, ratio } : best;
      },
      { provider: rows[0]?.providerId ?? '', ratio: Infinity }
    );

  if (bestRatio.ratio < Infinity) {
    insights.push(
      `${bestRatio.provider} tiene la mejor relación costo/request ($${bestRatio.ratio.toFixed(4)}/req)`
    );
  }

  // Model count
  if (rows.length >= 3) {
    insights.push(`Usaste ${rows.length} modelos distintos este período`);
  }

  // Input/output ratio
  if (totals.outputTokens > 0) {
    const ratio = totals.inputTokens / totals.outputTokens;
    const ratioStr = ratio.toFixed(1);
    const advice =
      ratio < 0.5
        ? 'tus respuestas son muy largas'
        : ratio > 2
          ? 'haces muchas preguntas detalladas'
          : 'balanceado';
    insights.push(`Tu ratio input/output es ${ratioStr}:1 — ${advice}`);
  }

  return insights;
}

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const period = req.query.period === '30d' ? '30d' : 'all';
    const userId = req.userId!;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const groupByResult = await prisma.usageEvent.groupBy({
      by: ['providerId', 'modelId'],
      where: {
        userId,
        ...(period === '30d' ? { createdAt: { gte: thirtyDaysAgo } } : {}),
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
      },
      _count: {
        id: true,
      },
      _avg: {
        latencyMs: true,
      },
    });

    // Build rows with cost calculation
    const rows: UsageRow[] = await Promise.all(
      groupByResult.map(async (group) => {
        const providerId = group.providerId;
        const modelId = group.modelId;
        const inputTokens = group._sum.inputTokens ?? 0;
        const outputTokens = group._sum.outputTokens ?? 0;
        const totalTokens = inputTokens + outputTokens;
        const requestCount = group._count.id;
        const avgLatencyMs = Math.round(group._avg.latencyMs ?? 0);

        const price = await getModelPrice(providerId, modelId);
        const estimatedCostUsd = calculateCost(inputTokens, outputTokens, price);

        return {
          providerId,
          modelId,
          displayName: modelId,
          inputTokens,
          outputTokens,
          totalTokens,
          requestCount,
          avgLatencyMs,
          estimatedCostUsd,
          hasBreakdown: inputTokens > 0 || outputTokens > 0,
        };
      })
    );

    // Sort by total tokens descending
    rows.sort((a, b) => b.totalTokens - a.totalTokens);

    // Compute totals
    const totals: UsageTotals = {
      inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
      outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
      totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
      totalRequests: rows.reduce((sum, r) => sum + r.requestCount, 0),
      totalCostUsd: rows.reduce((sum, r) => sum + r.estimatedCostUsd, 0),
      avgLatencyMs:
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, r) => sum + r.avgLatencyMs * r.requestCount, 0) /
                rows.reduce((sum, r) => sum + r.requestCount, 0)
            )
          : 0,
    };

    // Generate insights
    const insights = computeInsights(rows, totals);

    res.json({
      period,
      rows,
      totals,
      insights,
    });
  } catch (err) {
    req.log.error({ err }, 'usage aggregation failed');
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

/**
 * GET /usage/heatmap
 * Daily token totals for the last `period` days. Returns every day in the
 * range (zero days included) so the client can render without gap-filling.
 */
router.get('/heatmap', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const period = req.query.period === '3m' ? '3m' : req.query.period === '12m' ? '12m' : '6m';
    const periodDays = period === '3m' ? 90 : period === '12m' ? 365 : 180;
    const heatmap = await getDailyUsageHeatmap({
      userId: req.userId!,
      periodDays,
    });
    res.json({ period, ...heatmap });
  } catch (err) {
    req.log.error({ err }, 'usage heatmap aggregation failed');
    res.status(500).json({ error: 'Failed to fetch usage heatmap' });
  }
});

export default router;
