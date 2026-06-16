/**
 * Fills gaps in a daily time series so every day in the range has an entry.
 * Used to produce clean charts from sparse database rows.
 *
 * @param since  Start of the range (Date, inclusive)
 * @param days   Number of days in the range
 * @param rows   Array of { date: Date; count: number } from the database, may
 *                be sparse (days with zero rows are missing)
 * @returns      Array of length `days` with one entry per day, zeroes filled
 */
export function fillDateRange(
  since: Date,
  days: number,
  rows: Array<{ date: Date; count: number }>
): Array<{ date: string; count: number }> {
  const countByDate = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 10);
    countByDate.set(key, Number(row.count));
  }

  const result: Array<{ date: string; count: number }> = [];
  const cursor = new Date(since);
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, count: countByDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}
