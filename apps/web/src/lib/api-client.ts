import { storage } from "./storage";
const API_BASE = "/api";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return storage.get("token");
}

function buildHeaders(includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers["Content-Type"] = "application/json";
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
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = (await res.json()) as { token?: string };
        if (data?.token) {
          storage.set("token", data.token);
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
  storage.remove("token");
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/**
 * Typed wrapper around `fetch` for JSON APIs.
 * Automatically injects the auth token and parses JSON.
 * Rejects with ApiError on non-2xx.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const isJsonBody = Boolean(
    options.body && typeof options.body === "string" &&
    !(options.headers as Record<string, string> | undefined)?.["Content-Type"]
  );

  const headers: Record<string, string> = {
    ...buildHeaders(isJsonBody),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  // Access token expired → try a one-time refresh, then replay the request.
  // Skip for /auth/* so a failing refresh/login doesn't loop.
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
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
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/**
 * Convenience for GET requests.
 */
export function apiGet<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: "GET" });
}

/**
 * Convenience for POST requests with a JSON body.
 */
export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for PUT requests with a JSON body.
 */
export function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for PATCH requests with a JSON body.
 */
export function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Convenience for DELETE requests.
 */
export function apiDelete(path: string): Promise<void> {
  return api<void>(path, { method: "DELETE" });
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
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...buildHeaders(false),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  // Same single-flight refresh as `api` above. Skipped for /auth/* so a
  // failing login/refresh doesn't recurse.
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
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
