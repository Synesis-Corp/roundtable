import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProfile, __resetProfileCacheForTests } from './useProfile';
import { storage } from '../lib/storage';

const apiGetMock = vi.fn();
const apiPatchMock = vi.fn();
const apiDeleteMock = vi.fn();

vi.mock('../lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
  apiDelete: (...args: unknown[]) => apiDeleteMock(...args),
}));

function makeToken(seed: string) {
  const payload = JSON.stringify({ email: `u-${seed}@x.com`, sub: seed });
  return `hdr.${btoa(payload)}.sig`;
}

describe('useProfile — singleton cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetProfileCacheForTests();
    storage.remove('token');
    storage.set('token', makeToken('1'));
    apiGetMock.mockResolvedValue({
      id: 'u1',
      email: 'u-1@x.com',
      name: null,
      displayName: 'Elías',
      country: 'MX',
      timezone: 'America/Guayaquil',
      language: 'es',
    });
    apiGetMock.mockResolvedValueOnce({
      id: 'u1',
      email: 'u-1@x.com',
      name: null,
      displayName: 'Elías',
      country: 'MX',
      timezone: 'America/Guayaquil',
      language: 'es',
    });
    apiGetMock.mockResolvedValue({ sessions: [] });
  });

  afterEach(() => {
    storage.remove('token');
  });

  it('fetches /auth/profile + /auth/sessions only once across multiple consumers', async () => {
    const first = renderHook(() => useProfile());
    const second = renderHook(() => useProfile());
    const third = renderHook(() => useProfile());

    await waitFor(() => {
      expect(first.result.current.profile).not.toBeNull();
      expect(second.result.current.profile).not.toBeNull();
      expect(third.result.current.profile).not.toBeNull();
    });

    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(apiGetMock).toHaveBeenCalledWith('/auth/profile');
    expect(apiGetMock).toHaveBeenCalledWith('/auth/sessions');
  });

  it('updateProfile patches and updates the shared cache without refetching', async () => {
    apiPatchMock.mockResolvedValueOnce({
      id: 'u1',
      email: 'u-1@x.com',
      name: null,
      displayName: 'Nuevo Nombre',
      country: 'MX',
      timezone: 'America/Guayaquil',
      language: 'es',
    });

    const first = renderHook(() => useProfile());
    const second = renderHook(() => useProfile());
    await waitFor(() => expect(first.result.current.profile?.displayName).toBe('Elías'));

    await act(async () => {
      await first.result.current.updateProfile({ displayName: 'Nuevo Nombre' });
    });

    expect(apiPatchMock).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(first.result.current.profile?.displayName).toBe('Nuevo Nombre');
    expect(second.result.current.profile?.displayName).toBe('Nuevo Nombre');
  });

  it('revokeSession removes the session from the shared cache without refetching', async () => {
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValueOnce({
      id: 'u1',
      email: 'u-1@x.com',
      name: null,
      displayName: 'Elías',
      country: 'MX',
      timezone: 'America/Guayaquil',
      language: 'es',
    });
    apiGetMock.mockResolvedValueOnce({
      sessions: [
        {
          id: 'sess-1',
          userAgent: 'ua',
          ip: '1.2.3.4',
          lastSeenAt: '2026-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          expiresAt: '2026-02-01T00:00:00Z',
        },
      ],
    });
    apiDeleteMock.mockResolvedValueOnce({});

    const first = renderHook(() => useProfile());
    const second = renderHook(() => useProfile());
    await waitFor(() => expect(first.result.current.sessions).toHaveLength(1));

    await act(async () => {
      await first.result.current.revokeSession('sess-1');
    });

    expect(apiDeleteMock).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(first.result.current.sessions).toHaveLength(0);
    expect(second.result.current.sessions).toHaveLength(0);
  });

  it('invalidates cache when the access token changes (fresh login)', async () => {
    const first = renderHook(() => useProfile());
    await waitFor(() => expect(first.result.current.profile?.email).toBe('u-1@x.com'));

    // Fresh login: new token, new user. Cache must refetch and reflect the new identity.
    storage.set('token', makeToken('2'));
    apiGetMock.mockResolvedValueOnce({
      id: 'u2',
      email: 'u-2@x.com',
      name: null,
      displayName: 'Otro',
      country: null,
      timezone: null,
      language: null,
    });
    apiGetMock.mockResolvedValueOnce({ sessions: [] });

    const second = renderHook(() => useProfile());
    await waitFor(() => expect(second.result.current.profile?.email).toBe('u-2@x.com'));

    expect(apiGetMock).toHaveBeenCalledWith('/auth/profile');
    expect(apiGetMock).toHaveBeenCalledWith('/auth/sessions');
    expect(first.result.current.profile?.email).toBe('u-2@x.com');
  });

  it('subscribers receive cache updates (no React state isolation)', async () => {
    const first = renderHook(() => useProfile());
    const second = renderHook(() => useProfile());
    await waitFor(() => expect(first.result.current.profile?.displayName).toBe('Elías'));

    apiPatchMock.mockResolvedValueOnce({
      id: 'u1',
      email: 'u-1@x.com',
      name: null,
      displayName: 'A',
      country: 'MX',
      timezone: 'America/Guayaquil',
      language: 'es',
    });

    await act(async () => {
      await first.result.current.updateProfile({ displayName: 'A' });
    });

    expect(second.result.current.profile?.displayName).toBe('A');
  });
});
