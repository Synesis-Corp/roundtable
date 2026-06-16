/**
 * Admin metrics dashboard endpoints. All routes require auth + admin allowlist.
 * Every response is aggregated — zero PII, zero user content.
 */

import { Router } from 'express';
import { prisma } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { fillDateRange } from '../lib/date-range';

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

export default router;
