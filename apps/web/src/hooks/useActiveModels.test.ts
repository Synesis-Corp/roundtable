import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useActiveModels } from './useActiveModels';
import { PROVIDERS_CHANGED_EVENT } from '../lib/provider-events';

const apiGetMock = vi.fn();
const apiPutMock = vi.fn();

vi.mock('../lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPut: (...args: unknown[]) => apiPutMock(...args),
}));

describe('useActiveModels — providers-changed event emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits PROVIDERS_CHANGED_EVENT after a successful save', async () => {
    apiGetMock.mockResolvedValueOnce({ models: [], activeIds: [] });
    apiPutMock.mockResolvedValueOnce({ activeIds: ['k2p5', 'k2p6'] });
    const listener = vi.fn();
    window.addEventListener(PROVIDERS_CHANGED_EVENT, listener);

    const { result } = renderHook(() => useActiveModels('kimi-for-coding'));
    await act(async () => {
      await result.current.save(['k2p5', 'k2p6']);
    });

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(PROVIDERS_CHANGED_EVENT, listener);
  });

  it('does NOT emit PROVIDERS_CHANGED_EVENT when save fails', async () => {
    apiGetMock.mockResolvedValueOnce({ models: [], activeIds: [] });
    apiPutMock.mockRejectedValueOnce(new Error('network'));
    const listener = vi.fn();
    window.addEventListener(PROVIDERS_CHANGED_EVENT, listener);

    const { result } = renderHook(() => useActiveModels('kimi-for-coding'));
    await act(async () => {
      await expect(result.current.save(['k2p5'])).rejects.toThrow('network');
    });

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(PROVIDERS_CHANGED_EVENT, listener);
  });

  it('save is a no-op when providerId is null and emits nothing', async () => {
    const listener = vi.fn();
    window.addEventListener(PROVIDERS_CHANGED_EVENT, listener);

    const { result } = renderHook(() => useActiveModels(null));
    await act(async () => {
      await result.current.save(['k2p5']);
    });

    expect(apiPutMock).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(PROVIDERS_CHANGED_EVENT, listener);
  });
});
