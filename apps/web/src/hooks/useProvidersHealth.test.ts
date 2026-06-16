import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProvidersHealth } from './useProvidersHealth';

describe('useProvidersHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the provider health map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              health: {
                openai: { ok: true, checkedAt: 1000 },
                anthropic: { ok: false, error: 'API key invalid', checkedAt: 1000 },
              },
            }),
        })
      )
    );

    const { result } = renderHook(() => useProvidersHealth());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.health.openai).toEqual({ ok: true, checkedAt: 1000 });
    expect(result.current.health.anthropic.ok).toBe(false);
    expect(result.current.health.anthropic.error).toBe('API key invalid');
  });

  it('falls back to an empty map when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'boom' }) })
      )
    );

    const { result } = renderHook(() => useProvidersHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.health).toEqual({});
  });
});
