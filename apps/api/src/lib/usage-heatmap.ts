import { prisma as defaultPrisma } from './db';
import type { PrismaClient } from '@chat/db';

export interface DailyUsageRow {
  /** ISO date (YYYY-MM-DD), UTC, end of the day in the server timezone. */
  date: string;
  tokens: number;
}

export interface UsageHeatmap {
  /** One entry per day in the requested range, including zero days. */
  days: DailyUsageRow[];
  totalTokens: number;
  peakTokens: number;
  activeDays: number;
}

interface GetDailyUsageHeatmapOptions {
  /** When set, the heatmap is scoped to a single user. Omit for the global view. */
  userId?: string;
  /** Window length in days, ending today (inclusive). */
  periodDays?: number;
  /** Injectable for tests. Defaults to the module's Prisma client. */
  prismaClient?: PrismaClient;
}

const DEFAULT_PERIOD_DAYS = 180; // 6 months

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Returns one row per day for the last `periodDays` days (inclusive of today),
 * summing `inputTokens + outputTokens` from `UsageEvent`. Days with no usage
 * are returned with `tokens: 0` so the client doesn't have to gap-fill.
 *
 * The query runs server-side with `DATE_TRUNC('day', "createdAt")` so the
 * aggregation cost is O(rows in range), not O(days × rows).
 */
export async function getDailyUsageHeatmap({
  userId,
  periodDays = DEFAULT_PERIOD_DAYS,
  prismaClient,
}: GetDailyUsageHeatmapOptions = {}): Promise<UsageHeatmap> {
  const prisma = prismaClient ?? defaultPrisma;

  const today = startOfDayUTC(new Date());
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (periodDays - 1));

  // The user filter is parameterized — no string interpolation of user input
  // (only a `1` or `2` index placeholder), so $queryRawUnsafe is safe here.
  // DATE_TRUNC + SUM(inputTokens + outputTokens) over the inclusive [start, end+1d) window.
  const params: unknown[] = [start, today];
  let sql =
    `SELECT ` +
    `  DATE_TRUNC('day', "createdAt")::date AS day, ` +
    `  SUM("inputTokens" + "outputTokens")::bigint AS tokens ` +
    `FROM "UsageEvent" ` +
    `WHERE "createdAt" >= $1 AND "createdAt" < $2 `;
  if (userId !== undefined) {
    sql += `AND "userId" = $3 `;
    params.push(userId);
  }
  sql += `GROUP BY day ORDER BY day ASC`;

  const rows = await prisma.$queryRawUnsafe<{ day: Date; tokens: bigint | number | null }[]>(
    sql,
    ...params
  );

  // Build a dense day map from start..today so the client never has to gap-fill.
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const tokensNum =
      r.tokens === null || r.tokens === undefined
        ? 0
        : typeof r.tokens === 'bigint'
          ? Number(r.tokens)
          : Number(r.tokens);
    const dayStr = r.day instanceof Date ? isoDate(r.day) : isoDate(new Date(r.day));
    byDate.set(dayStr, (byDate.get(dayStr) ?? 0) + tokensNum);
  }

  const days: DailyUsageRow[] = [];
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = isoDate(d);
    days.push({ date: key, tokens: byDate.get(key) ?? 0 });
  }

  const totalTokens = days.reduce((sum, d) => sum + d.tokens, 0);
  const peakTokens = days.reduce((peak, d) => (d.tokens > peak ? d.tokens : peak), 0);
  const activeDays = days.filter((d) => d.tokens > 0).length;

  return { days, totalTokens, peakTokens, activeDays };
}
