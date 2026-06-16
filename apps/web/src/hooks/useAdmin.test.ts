import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdmin } from './useAdmin';

describe('useAdmin', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('sets isAdmin=true when overview returns 200', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            totalUsers: 10,
            activeToday: 3,
            totalTokens: 1000,
            totalRequests: 50,
            registeredToday: 2,
          }),
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('sets isAdmin=false when overview returns 403', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' }),
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('sets isAdmin=false on network error', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('Network error')));
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('starts with loading=true', () => {
    const fetchSpy = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAdmin());

    expect(result.current.loading).toBe(true);
  });
});
