import { describe, it, expect } from 'vitest';
import { fillDateRange } from './date-range';

describe('fillDateRange', () => {
  it('fills gaps with zeroes', () => {
    const since = new Date('2026-06-01T00:00:00Z');
    const rows = [
      { date: new Date('2026-06-01T00:00:00Z'), count: 3 },
      { date: new Date('2026-06-05T00:00:00Z'), count: 1 },
    ];

    const result = fillDateRange(since, 7, rows);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ date: '2026-06-01', count: 3 });
    expect(result[1]).toEqual({ date: '2026-06-02', count: 0 });
    expect(result[2]).toEqual({ date: '2026-06-03', count: 0 });
    expect(result[3]).toEqual({ date: '2026-06-04', count: 0 });
    expect(result[4]).toEqual({ date: '2026-06-05', count: 1 });
    expect(result[5]).toEqual({ date: '2026-06-06', count: 0 });
    expect(result[6]).toEqual({ date: '2026-06-07', count: 0 });
  });

  it('returns all zeroes when rows is empty', () => {
    const since = new Date('2026-06-01T00:00:00Z');

    const result = fillDateRange(since, 3, []);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: '2026-06-01', count: 0 });
    expect(result[1]).toEqual({ date: '2026-06-02', count: 0 });
    expect(result[2]).toEqual({ date: '2026-06-03', count: 0 });
  });

  it('handles single day range', () => {
    const since = new Date('2026-06-10T00:00:00Z');
    const rows = [{ date: new Date('2026-06-10T00:00:00Z'), count: 5 }];

    const result = fillDateRange(since, 1, rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2026-06-10', count: 5 });
  });

  it('converts bigint counts to numbers', () => {
    const since = new Date('2026-06-01T00:00:00Z');
    const rows = [
      { date: new Date('2026-06-01T00:00:00Z'), count: BigInt(42) as unknown as number },
    ];

    const result = fillDateRange(since, 2, rows);

    expect(result[0].count).toBe(42);
    expect(result[1].count).toBe(0);
  });
});
