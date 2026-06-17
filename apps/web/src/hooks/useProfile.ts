import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { apiGet, apiPatch, apiDelete } from '../lib/api-client';
import { storage } from '../lib/storage';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  country: string | null;
  timezone: string | null;
  language: string | null;
}

export interface UserSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}

interface ProfileSnapshot {
  profile: UserProfile | null;
  sessions: UserSession[];
  loading: boolean;
  error: boolean;
}

const EMPTY: ProfileSnapshot = { profile: null, sessions: [], loading: true, error: false };
const LOGGED_OUT: ProfileSnapshot = { profile: null, sessions: [], loading: false, error: false };

interface CacheEntry {
  fp: string;
  snapshot: ProfileSnapshot;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

/** Stable fingerprint of the current access token (the JWT payload is enough). */
function tokenFingerprint(): string | null {
  const token = storage.get('token');
  if (!token) return null;
  const parts = token.split('.');
  return parts[1] ?? null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Returns the current snapshot for the active token. Triggers a single
 * in-flight fetch per token if no cache exists. Subsequent callers reuse
 * the same promise — the data is fetched once per token, shared across
 * every component that calls useProfile().
 *
 * Returns referentially stable objects so `useSyncExternalStore`'s
 * `Object.is` comparison can short-circuit re-renders.
 */
function getSnapshot(): ProfileSnapshot {
  const fp = tokenFingerprint();
  if (!fp) {
    if (cache) {
      cache = null;
      notify();
    }
    return LOGGED_OUT;
  }
  if (cache && cache.fp !== fp) {
    cache = null;
    // Tell every active consumer to re-read. Without this, a token change in
    // the same tab leaves subscribers rendering the previous user's profile
    // until something else triggers a render.
    notify();
  }
  if (!cache) {
    if (!inFlight) {
      const fetchFp = fp;
      inFlight = Promise.all([
        apiGet<UserProfile>('/auth/profile'),
        apiGet<{ sessions: UserSession[] }>('/auth/sessions'),
      ])
        .then(([profile, sessionsData]) => {
          cache = {
            fp: fetchFp,
            snapshot: { profile, sessions: sessionsData.sessions, loading: false, error: false },
          };
        })
        .catch(() => {
          cache = {
            fp: fetchFp,
            snapshot: { profile: null, sessions: [], loading: false, error: true },
          };
        })
        .finally(() => {
          inFlight = null;
          notify();
        });
    }
    return EMPTY;
  }
  return cache.snapshot;
}

/**
 * Test-only: clear the in-memory cache and pending fetch. Production code
 * relies on the access token changing (fingerprint mismatch) to invalidate.
 */
export function __resetProfileCacheForTests() {
  cache = null;
  inFlight = null;
  notify();
}

export function useProfile() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Detect token changes from inside a hook (storage events don't fire in the
  // same tab) and tell the cache to re-evaluate. One running hook instance is
  // enough; the notify() wakes every other consumer via useSyncExternalStore.
  useEffect(() => {
    const fp = tokenFingerprint();
    if (fp && cache && cache.fp !== fp) {
      cache = null;
      notify();
    }
  });

  const updateProfile = useCallback(
    async (
      fields: Partial<Pick<UserProfile, 'displayName' | 'country' | 'timezone' | 'language'>>
    ) => {
      const updated = await apiPatch<UserProfile>('/auth/profile', fields);
      if (cache) {
        cache = {
          ...cache,
          snapshot: { ...cache.snapshot, profile: updated },
        };
      }
      notify();
      return updated;
    },
    []
  );

  const revokeSession = useCallback(async (sessionId: string) => {
    await apiDelete(`/auth/sessions/${sessionId}`);
    if (cache) {
      cache = {
        ...cache,
        snapshot: {
          ...cache.snapshot,
          sessions: cache.snapshot.sessions.filter((s) => s.id !== sessionId),
        },
      };
    }
    notify();
  }, []);

  return {
    profile: snapshot.profile,
    loading: snapshot.loading,
    error: snapshot.error,
    sessions: snapshot.sessions,
    saving: false,
    updateProfile,
    revokeSession,
  };
}
