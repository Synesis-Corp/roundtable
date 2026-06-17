import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCouncilConfig } from './useCouncilConfig';
import { PROVIDERS_CHANGED_EVENT } from '../lib/provider-events';

describe('useCouncilConfig', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    vi.restoreAllMocks();
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('returns null config without a token (no fetch)', async () => {
    localStorage.removeItem('token');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loads config from GET /api/council/config', async () => {
    const config = {
      id: 'cfg-1',
      userId: 'u-1',
      modelIds: ['openai:gpt-4o', 'anthropic:claude-3-opus'],
      mode: 'manual',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(config) })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(config);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/council/config',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
  });

  it('treats 204 as null config', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toBeNull();
  });

  it('updates config via PUT /api/council/config', async () => {
    const updated = {
      id: 'cfg-1',
      userId: 'u-1',
      modelIds: ['openai:gpt-4o'],
      mode: 'manual',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };
    const fetchSpy = vi.fn((url: string, opts: RequestInit) => {
      if (opts.method === 'GET') {
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(updated) });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateConfig(['openai:gpt-4o'], 'manual');
    });

    expect(result.current.config).toEqual(updated);
    const putCall = fetchSpy.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall![1].body).toBe(JSON.stringify({ modelIds: ['openai:gpt-4o'], mode: 'manual' }));
  });

  it('deletes config via DELETE /api/council/config', async () => {
    const existing = {
      id: 'cfg-1',
      userId: 'u-1',
      modelIds: ['openai:gpt-4o'],
      mode: 'manual',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const fetchSpy = vi.fn((url: string, opts: RequestInit) => {
      if (opts.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(existing) });
      }
      return Promise.resolve({ ok: true, status: 204 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config).toEqual(existing);

    await act(async () => {
      await result.current.deleteConfig();
    });

    expect(result.current.config).toBeNull();
    const deleteCall = fetchSpy.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall![0]).toBe('/api/council/config');
  });

  it('surfaces fetch errors', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('Server error');
  });

  it('refetches when PROVIDERS_CHANGED_EVENT fires (regression: stale manual config after disconnect)', async () => {
    const initial = {
      id: 'cfg-1',
      userId: 'u-1',
      modelIds: ['deepseek:deepseek-v4-flash', 'openai:gpt-5.4'],
      mode: 'manual',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const cleaned = {
      ...initial,
      modelIds: ['openai:gpt-5.4'],
    };
    const fetchSpy = vi.fn((url: string, opts: RequestInit) => {
      const callCount = fetchSpy.mock.calls.filter((c) => c[1]?.method === 'GET').length;
      if (opts.method === 'GET') {
        const body = callCount === 1 ? initial : cleaned;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }
      return Promise.resolve({ ok: true, status: 204 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useCouncilConfig());
    await waitFor(() => expect(result.current.config?.modelIds).toEqual(initial.modelIds));

    act(() => {
      window.dispatchEvent(new CustomEvent(PROVIDERS_CHANGED_EVENT));
    });

    await waitFor(() => expect(result.current.config?.modelIds).toEqual(cleaned.modelIds));
  });
});
