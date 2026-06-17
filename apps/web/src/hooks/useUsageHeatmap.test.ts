import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsageHeatmap } from './useUsageHeatmap';

const apiGetMock = vi.fn();
vi.mock('../lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
}));

const sample = {
  period: '6m' as const,
  days: [{ date: '2026-06-17', tokens: 100 }],
  totalTokens: 100,
  peakTokens: 100,
  activeDays: 1,
};

describe('useUsageHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches /usage/heatmap on mount with default period 6m', async () => {
    apiGetMock.mockResolvedValueOnce(sample);
    const { result } = renderHook(() => useUsageHeatmap());

    await waitFor(() => expect(result.current.data).toEqual(sample));
    expect(apiGetMock).toHaveBeenCalledWith('/usage/heatmap?period=6m');
    expect(result.current.period).toBe('6m');
  });

  it('refetches when setPeriod changes the period', async () => {
    apiGetMock.mockResolvedValue(sample);
    const { result } = renderHook(() => useUsageHeatmap());

    await waitFor(() => expect(result.current.data).toEqual(sample));
    apiGetMock.mockClear();

    await act(async () => {
      result.current.setPeriod('3m');
    });

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/usage/heatmap?period=3m');
    });
  });

  it('exposes refetch without re-creating the hook instance', async () => {
    apiGetMock.mockResolvedValue(sample);
    const { result } = renderHook(() => useUsageHeatmap());

    await waitFor(() => expect(result.current.data).toEqual(sample));
    apiGetMock.mockClear();

    await act(async () => {
      result.current.refetch();
    });

    expect(apiGetMock).toHaveBeenCalledWith('/usage/heatmap?period=6m');
  });

  it('surfaces errors via the error state', async () => {
    apiGetMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useUsageHeatmap());

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.data).toBeNull();
  });
});
