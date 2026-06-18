import { storage } from './storage';
const API_BASE = '/api';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const getCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_GET_TTL_MS = 3000;

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return storage.get('token');
}

function buildHeaders(includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// Single-flight refresh: when the access token expires, many in-flight requests
// can 401 at once; they all await the SAME /auth/refresh call instead of
// stampeding it. The refresh token rides along automatically in the httpOnly cookie.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = (await res.json()) as { token?: string };
        if (data?.token) {
          storage.set('token', data.token);
          return true;
        }
        return false;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin(): void {
  storage.remove('token');
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

const isTest = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

function cacheKey(url: string): string {
  return url;
}

function readCache<T>(url: string): T | undefined {
  if (isTest) return undefined;
  const entry = getCache.get(cacheKey(url));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    getCache.delete(cacheKey(url));
    return undefined;
  }
  return entry.data as T;
}

function writeCache<T>(url: string, data: T, ttlMs = DEFAULT_GET_TTL_MS): void {
  if (isTest) return;
  getCache.set(cacheKey(url), { data, expiresAt: Date.now() + ttlMs });
}

function invalidateCacheForPath(path: string): void {
  if (isTest) return;
  const prefix = path.startsWith('http') ? path : `${API_BASE}${path}`;
  for (const key of getCache.keys()) {
    if (key.startsWith(prefix)) {
      getCache.delete(key);
    }
  }
}

/**
 * Typed wrapper around `fetch` for JSON APIs.
 * Automatically injects the auth token and parses JSON.
 * Rejects with ApiError on non-2xx.
 *
 * GET responses are cached in memory for a short TTL to avoid redundant
 * fetches when multiple hooks mount simultaneously or on rapid navigation.
 * Mutations (POST/PUT/PATCH/DELETE) invalidate the cache for the same path.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & { skipCache?: boolean } = {},
  retry = true
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const isGet = (options.method || 'GET').toUpperCase() === 'GET';
  const { skipCache, ...fetchOptions } = options;

  if (isGet && !skipCache) {
    const cached = readCache<T>(url);
    if (cached !== undefined) {
      return cached;
    }
  }

  const isJsonBody = Boolean(
    fetchOptions.body &&
    typeof fetchOptions.body === 'string' &&
    !(fetchOptions.headers as Record<string, string> | undefined)?.['Content-Type']
  );

  const headers: Record<string, string> = {
    ...buildHeaders(isJsonBody),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...fetchOptions, headers, credentials: 'include' });

  // Access token expired → try a one-time refresh, then replay the request.
  // Skip for /auth/* so a failing refresh/login doesn't loop.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api<T>(path, options, false); // replay once with the new access token
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const message = await parseError(res);
    throw new ApiError(message, res.status, null);
  }

  // DELETE 204 or empty body
  if (res.status === 204) {
    if (!isGet) invalidateCacheForPath(path);
    return undefined as T;
  }

  const data = (await res.json()) as T;

  if (isGet) {
    writeCache(url, data);
  } else {
    invalidateCacheForPath(path);
  }

  return data;
}

/**
 * Convenience for GET requests.
 */
export function apiGet<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' });
}

/**
 * Convenience for POST requests with a JSON body.
 */
export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for PUT requests with a JSON body.
 */
export function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for PATCH requests with a JSON body.
 */
export function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for DELETE requests.
 */
export function apiDelete(path: string): Promise<void> {
  return api<void>(path, { method: 'DELETE' });
}

export interface ConversationSearchResult {
  id: string;
  title: string;
  updatedAt: string;
  matchedIn: 'title' | 'content';
  snippet: string | null;
}

export interface ConversationSearchResponse {
  results: ConversationSearchResult[];
}

export function searchConversations(
  q: string,
  limit?: number,
  signal?: AbortSignal
): Promise<ConversationSearchResponse> {
  const params = new URLSearchParams({ q });
  if (limit !== undefined) params.set('limit', String(limit));
  return api<ConversationSearchResponse>(`/conversations/search?${params.toString()}`, {
    method: 'GET',
    signal,
    skipCache: true,
  });
}

/**
 * Initiates an SSE stream. Returns a Response that the caller must read
 * with `res.body.getReader()` or similar. Rejects on non-2xx before streaming.
 *
 * Mirrors `api`'s 401-refresh-retry logic so a long-running stream started
 * just before the access token expires doesn't get killed by a stale token.
 * Without this, the user would see a phantom "Error: Invalid token" as the
 * chat assistant's reply every time the 15-min access TTL elapsed mid-stream.
 * (Regression fixed 2026-06-11.)
 */
export async function apiStream(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...buildHeaders(false),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  // Same single-flight refresh as `api` above. Skipped for /auth/* so a
  // failing login/refresh doesn't recurse.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiStream(path, options, false);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const message = await parseError(res);
    throw new ApiError(message, res.status, null);
  }

  return res;
}

export { ApiError };
