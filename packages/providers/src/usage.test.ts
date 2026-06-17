import { describe, it, expect } from 'vitest';
import { normalizeUsage } from './usage';

describe('normalizeUsage', () => {
  it('returns empty object for null/undefined usage', () => {
    expect(normalizeUsage(null)).toEqual({});
    expect(normalizeUsage(undefined)).toEqual({});
  });

  it('prefers inputTokens/outputTokens (Responses API shape)', () => {
    const result = normalizeUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(result).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('falls back to promptTokens/completionTokens (completions API shape)', () => {
    const result = normalizeUsage({ promptTokens: 20, completionTokens: 8, totalTokens: 28 });
    expect(result).toEqual({ inputTokens: 20, outputTokens: 8, totalTokens: 28 });
  });

  it('derives totalTokens from input + output when total is missing', () => {
    const result = normalizeUsage({ promptTokens: 7, completionTokens: 3 });
    expect(result).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
  });

  it('prefers explicit totalTokens over derived sum', () => {
    const result = normalizeUsage({ inputTokens: 1, outputTokens: 1, totalTokens: 5 });
    expect(result.totalTokens).toBe(5);
  });

  it('ignores NaN values', () => {
    const result = normalizeUsage({ inputTokens: NaN, promptTokens: 4, outputTokens: 2 });
    expect(result).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  });

  it('returns only totalTokens when input/output are absent', () => {
    const result = normalizeUsage({ totalTokens: 99 });
    expect(result).toEqual({ totalTokens: 99 });
  });
});
