/**
 * Admin metrics dashboard endpoints. All routes require auth + admin allowlist.
 * Every response is aggregated — zero PII, zero user content.
 */

import { Router } from 'express';
import { prisma } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { fillDateRange } from '../lib/date-range';
import { getModelPrice, calculateCost } from '../lib/model-pricing';

const router = Router();

router.use(authMiddleware, requireAdmin);

function parsePeriod(query: { period?: string }): { days: number; since: Date } {
  const days = query.period === '90d' ? 90 : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  return { days, since };
}

router.get('/metrics/overview', async (_req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [totalUsers, activeTodayRows, tokenAgg, totalRequests, registeredToday] =
      await Promise.all([
        prisma.user.count(),
        prisma.usageEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: today } },
        }),
        prisma.usageEvent.aggregate({
          _sum: { inputTokens: true, outputTokens: true },
        }),
        prisma.usageEvent.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
      ]);

    res.json({
      totalUsers,
      activeToday: activeTodayRows.length,
      totalTokens: (tokenAgg._sum.inputTokens ?? 0) + (tokenAgg._sum.outputTokens ?? 0),
      totalRequests,
      registeredToday,
    });
  } catch (err) {
    console.error(err, 'admin metrics overview failed');
    res.status(500).json({ error: 'Failed to fetch overview metrics' });
  }
});

router.get('/metrics/registrations', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const rows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt")::date AS date,
             COUNT(*)::int AS count
      FROM "User"
      WHERE "createdAt" >= ${since}
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;

    const days_filled = fillDateRange(
      since,
      days,
      rows.map((r) => ({ date: r.date, count: Number(r.count) }))
    );

    res.json({ period: `${days}d`, days: days_filled });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics registrations failed');
    res.status(500).json({ error: 'Failed to fetch registration metrics' });
  }
});

router.get('/metrics/active-users', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const rows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT d::date AS date,
             COUNT(DISTINCT ue."userId")::int AS count
      FROM generate_series(${since}::date, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN "UsageEvent" ue
        ON DATE_TRUNC('day', ue."createdAt") = d
      GROUP BY d
      ORDER BY d ASC
    `;

    const days_filled = rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    res.json({ period: `${days}d`, days: days_filled });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics active-users failed');
    res.status(500).json({ error: 'Failed to fetch active user metrics' });
  }
});

router.get('/metrics/usage', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const [byProvider, byModel] = await Promise.all([
      prisma.usageEvent.groupBy({
        by: ['providerId'],
        where: { createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { id: true },
      }),
      prisma.usageEvent.groupBy({
        by: ['providerId', 'modelId'],
        where: { createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { id: true },
      }),
    ]);

    const mapRow = (g: (typeof byProvider)[number] | (typeof byModel)[number]) => ({
      totalTokens: (g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0),
      totalRequests: g._count.id,
    });

    res.json({
      period: `${days}d`,
      byProvider: byProvider
        .map((g) => ({ providerId: g.providerId, ...mapRow(g) }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      byModel: byModel
        .map((g) => ({
          providerId: g.providerId,
          modelId: g.modelId,
          ...mapRow(g),
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics usage failed');
    res.status(500).json({ error: 'Failed to fetch usage metrics' });
  }
});

router.get('/metrics/modes', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const result = await prisma.usageEvent.groupBy({
      by: ['mode'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    });

    res.json({
      period: `${days}d`,
      modes: result.map((r) => ({ mode: r.mode, count: r._count.id })),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics modes failed');
    res.status(500).json({ error: 'Failed to fetch mode metrics' });
  }
});

router.get('/metrics/latency', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const result = await prisma.usageEvent.groupBy({
      by: ['providerId'],
      where: { createdAt: { gte: since }, latencyMs: { not: null } },
      _avg: { latencyMs: true },
      _count: { id: true },
    });

    res.json({
      period: `${days}d`,
      providers: result
        .map((r) => ({
          providerId: r.providerId,
          avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
          requestCount: r._count.id,
        }))
        .sort((a, b) => b.requestCount - a.requestCount),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics latency failed');
    res.status(500).json({ error: 'Failed to fetch latency metrics' });
  }
});

router.get('/metrics/costs', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const result = await prisma.usageEvent.groupBy({
      by: ['providerId', 'modelId'],
      where: { createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    });

    const rows = await Promise.all(
      result.map(async (g) => {
        const providerId = g.providerId;
        const modelId = g.modelId;
        const inputTokens = g._sum.inputTokens ?? 0;
        const outputTokens = g._sum.outputTokens ?? 0;
        const price = await getModelPrice(providerId, modelId);
        const estimatedCostUsd = calculateCost(inputTokens, outputTokens, price);

        return {
          providerId,
          modelId,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          requestCount: g._count.id,
          estimatedCostUsd,
        };
      })
    );

    const byProvider = new Map<
      string,
      { totalCostUsd: number; totalTokens: number; requestCount: number }
    >();
    for (const row of rows) {
      const existing = byProvider.get(row.providerId);
      if (existing) {
        existing.totalCostUsd += row.estimatedCostUsd;
        existing.totalTokens += row.totalTokens;
        existing.requestCount += row.requestCount;
      } else {
        byProvider.set(row.providerId, {
          totalCostUsd: row.estimatedCostUsd,
          totalTokens: row.totalTokens,
          requestCount: row.requestCount,
        });
      }
    }

    res.json({
      period: `${days}d`,
      totalCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
      byProvider: Array.from(byProvider.entries())
        .map(([providerId, v]) => ({ providerId, ...v }))
        .sort((a, b) => b.totalCostUsd - a.totalCostUsd),
      byModel: rows.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics costs failed');
    res.status(500).json({ error: 'Failed to fetch cost metrics' });
  }
});

router.get('/metrics/adoption', async (req, res) => {
  try {
    const [totalUsers, _totalUsageEvents, usersWithProviders, councilUsers] = await Promise.all([
      prisma.user.count(),
      prisma.usageEvent.count(),
      prisma.providerConfig.groupBy({ by: ['userId'] }).then((r) => r.length),
      prisma.usageEvent
        .groupBy({ by: ['userId'], where: { mode: 'council' } })
        .then((r) => r.length),
    ]);

    const totalActive = await prisma.usageEvent.groupBy({ by: ['userId'] }).then((r) => r.length);

    res.json({
      totalUsers,
      activeUsers: totalActive,
      usersWithProviders,
      councilUsers,
      activationRate: totalUsers > 0 ? Math.round((totalActive / totalUsers) * 100) : 0,
      providerConnectionRate:
        totalUsers > 0 ? Math.round((usersWithProviders / totalUsers) * 100) : 0,
      councilAdoptionRate: totalActive > 0 ? Math.round((councilUsers / totalActive) * 100) : 0,
    });
  } catch (err) {
    console.error(err, 'admin metrics adoption failed');
    res.status(500).json({ error: 'Failed to fetch adoption metrics' });
  }
});

router.get('/metrics/retention', async (req, res) => {
  try {
    const days = req.query.period === '90d' ? 90 : 30;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const activeLastWeek = await prisma.usageEvent.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: new Date(weekAgo.getTime() - days * 86400000), lt: weekAgo },
      },
    });

    const activeThisWeek = await prisma.usageEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: weekAgo } },
    });

    const lastWeekIds = new Set(activeLastWeek.map((r) => r.userId));
    const retained = activeThisWeek.filter((r) => lastWeekIds.has(r.userId)).length;

    res.json({
      activeLastWeek: lastWeekIds.size,
      activeThisWeek: activeThisWeek.length,
      retained,
      retentionRate: lastWeekIds.size > 0 ? Math.round((retained / lastWeekIds.size) * 100) : 0,
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics retention failed');
    res.status(500).json({ error: 'Failed to fetch retention metrics' });
  }
});

router.get('/metrics/token-ratio', async (req, res) => {
  try {
    const { days, since } = parsePeriod(req.query as { period?: string });

    const result = await prisma.usageEvent.groupBy({
      by: ['providerId'],
      where: { createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    });

    res.json({
      period: `${days}d`,
      providers: result
        .map((r) => {
          const input = r._sum.inputTokens ?? 0;
          const output = r._sum.outputTokens ?? 0;
          return {
            providerId: r.providerId,
            inputTokens: input,
            outputTokens: output,
            ratio: output > 0 ? parseFloat((input / output).toFixed(2)) : 0,
            requestCount: r._count.id,
          };
        })
        .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics token-ratio failed');
    res.status(500).json({ error: 'Failed to fetch token ratio metrics' });
  }
});

router.get('/metrics/time-to-first-chat', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ hours: number; count: bigint }>>`
      SELECT
        EXTRACT(EPOCH FROM (MIN(ue."createdAt") - u."createdAt")) / 3600 AS hours,
        COUNT(*)::int AS count
      FROM "User" u
      LEFT JOIN "UsageEvent" ue ON ue."userId" = u.id
      GROUP BY u.id
      HAVING MIN(ue."createdAt") IS NOT NULL
    `;

    const hours = rows.map((r) => Number(r.hours));

    res.json({
      averageHours:
        hours.length > 0 ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : 0,
      medianHours: hours.length > 0 ? hours.sort((a, b) => a - b)[Math.floor(hours.length / 2)] : 0,
      totalUsersWithChat: hours.length,
      buckets: [
        { label: '< 1 min', max: 1 / 60, count: hours.filter((h) => h < 1 / 60).length },
        { label: '< 1 hour', max: 1, count: hours.filter((h) => h < 1).length },
        { label: '< 24 hours', max: 24, count: hours.filter((h) => h < 24).length },
        { label: '1-7 days', max: 168, count: hours.filter((h) => h >= 24 && h < 168).length },
        { label: '> 7 days', max: Infinity, count: hours.filter((h) => h >= 168).length },
      ],
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics time-to-first-chat failed');
    res.status(500).json({ error: 'Failed to fetch time-to-first-chat metrics' });
  }
});

router.get('/metrics/demographics', async (req, res) => {
  try {
    const [countries, timezones] = await Promise.all([
      prisma.user.groupBy({
        by: ['country'],
        where: { country: { not: null } },
        _count: { id: true },
      }),
      prisma.user.groupBy({
        by: ['timezone'],
        where: { timezone: { not: null } },
        _count: { id: true },
      }),
    ]);

    res.json({
      countries: countries
        .map((r) => ({ country: r.country as string, count: r._count.id }))
        .sort((a, b) => b.count - a.count),
      timezones: timezones
        .map((r) => ({ timezone: r.timezone as string, count: r._count.id }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    req.log?.error({ err }, 'admin metrics demographics failed');
    res.status(500).json({ error: 'Failed to fetch demographics metrics' });
  }
});

export default router;
