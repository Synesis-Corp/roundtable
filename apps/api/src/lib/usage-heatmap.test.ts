import { describe, it, expect, vi } from 'vitest';
import { getDailyUsageHeatmap } from './usage-heatmap';

function makePrisma(rows: { day: string; tokens: number | bigint }[]) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(
      rows.map((r) => ({
        day: new Date(`${r.day}T00:00:00.000Z`),
        tokens: r.tokens,
      }))
    ),
  };
}

const TODAY = new Date('2026-06-17T12:00:00.000Z');

describe('getDailyUsageHeatmap', () => {
  it('returns one row per day for the default 180-day window with zero days included', async () => {
    const prisma = makePrisma([]);
    const result = await getDailyUsageHeatmap({ prismaClient: prisma as never, periodDays: 7 });

    expect(result.days).toHaveLength(7);
    expect(result.totalTokens).toBe(0);
    expect(result.peakTokens).toBe(0);
    expect(result.activeDays).toBe(0);
  });

  it('coerces bigint token sums to Number for safe JSON transport', async () => {
    const prisma = makePrisma([{ day: '2026-06-17', tokens: BigInt(12345678901) }]);
    const result = await getDailyUsageHeatmap({ prismaClient: prisma as never, periodDays: 1 });

    expect(result.days[0].tokens).toBe(12345678901);
    expect(result.totalTokens).toBe(12345678901);
    expect(result.peakTokens).toBe(12345678901);
    expect(result.activeDays).toBe(1);
  });

  it('fills missing days with tokens: 0 (no client-side gap-fill required)', async () => {
    const prisma = makePrisma([{ day: '2026-06-15', tokens: 100 }]);
    const result = await getDailyUsageHeatmap({
      prismaClient: prisma as never,
      periodDays: 5,
    });

    // 5 days ending today (2026-06-17). Only the 15th has data.
    expect(result.days).toHaveLength(5);
    const byDate = Object.fromEntries(result.days.map((d) => [d.date, d.tokens]));
    expect(byDate['2026-06-13']).toBe(0);
    expect(byDate['2026-06-14']).toBe(0);
    expect(byDate['2026-06-15']).toBe(100);
    expect(byDate['2026-06-16']).toBe(0);
    expect(byDate['2026-06-17']).toBe(0);
  });

  it('scopes the query to a single user when userId is provided', async () => {
    const prisma = makePrisma([]);
    await getDailyUsageHeatmap({
      prismaClient: prisma as never,
      periodDays: 1,
      userId: 'user-42',
    });

    const callArgs = prisma.$queryRawUnsafe.mock.calls[0] ?? [];
    const sql = (callArgs[0] as string) ?? '';
    expect(sql).toMatch(/userId/i);
    expect(callArgs).toContain('user-42');
  });

  it('does NOT include a userId clause when the heatmap is global', async () => {
    const prisma = makePrisma([]);
    await getDailyUsageHeatmap({ prismaClient: prisma as never, periodDays: 1 });

    const callArgs = prisma.$queryRawUnsafe.mock.calls[0] ?? [];
    // No userId argument after the SQL + 2 date params.
    expect(callArgs).toHaveLength(3);
  });

  it('computes totals correctly across many days', async () => {
    const prisma = makePrisma([
      { day: '2026-06-15', tokens: 10 },
      { day: '2026-06-16', tokens: 50 },
      { day: '2026-06-17', tokens: 200 },
    ]);
    const result = await getDailyUsageHeatmap({ prismaClient: prisma as never, periodDays: 5 });

    expect(result.totalTokens).toBe(260);
    expect(result.peakTokens).toBe(200);
    expect(result.activeDays).toBe(3);
  });
});

// Freeze "now" so the date math is deterministic.
vi.useFakeTimers();
vi.setSystemTime(TODAY);
