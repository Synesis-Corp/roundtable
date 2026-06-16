import { randomBytes, createHash } from 'node:crypto';
import type { CookieOptions, Response } from 'express';

/**
 * Refresh token strategy (httpOnly cookie):
 *  - The refresh token is an opaque random value, NEVER a JWT.
 *  - Only its sha256 hash is stored in the DB (raw value lives solely in the
 *    httpOnly cookie), so a DB leak can't be replayed.
 *  - It is delivered as an httpOnly + SameSite cookie scoped to `/auth`, so
 *    browser JS can't read it (XSS-resistant) and it only rides along to the
 *    refresh/logout endpoints.
 *  - Access tokens stay short-lived JWTs in the Authorization header.
 */

export const REFRESH_COOKIE_NAME = 'refreshToken';

/** Refresh token lifetime: 30 days. Access token stays at 15m (see ACCESS_TTL
 *  below) so the access-token window is short even though the refresh window
 *  is long — the user only re-logs in if they're idle for 30+ days. */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Access token lifetime: 15 minutes (kept in sync with signToken). */
export const ACCESS_TTL = '15m';

export interface GeneratedRefreshToken {
  /** Raw opaque token — goes into the cookie, never persisted. */
  raw: string;
  /** sha256(raw) — the only form persisted in the DB. */
  hash: string;
  /** Absolute expiry timestamp. */
  expiresAt: Date;
}

/** Generates a fresh opaque refresh token plus its hash and expiry. */
export function generateRefreshToken(now: Date = new Date()): GeneratedRefreshToken {
  const raw = randomBytes(32).toString('hex');
  return {
    raw,
    hash: hashRefreshToken(raw),
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
  };
}

/** sha256 hex digest of a raw refresh token. Deterministic — used for lookups. */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Public path the refresh cookie is scoped to. Defaults to "/auth" (native dev,
 * where the browser hits the API at its root). Behind a reverse proxy that
 * mounts the API under a prefix (e.g. the web container serves the SPA and
 * proxies "/api" → api), the browser-visible path is "/api/auth", so the cookie
 * MUST be scoped there or it is never sent on refresh/logout. The API can't know
 * its own public prefix, so it is configured via env — same reason as WEB_URL.
 */
export function refreshCookiePath(): string {
  return process.env.REFRESH_COOKIE_PATH ?? '/auth';
}

/**
 * Cookie options for the refresh token. `secure` only in production so local
 * HTTP dev still works. The path limits the cookie to the auth surface.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: refreshCookiePath(),
    maxAge: REFRESH_TTL_MS,
  };
}

/** Sets the refresh cookie on the response. */
export function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(REFRESH_COOKIE_NAME, raw, refreshCookieOptions());
}

/** Clears the refresh cookie (logout / invalid token). Must match the set path. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: refreshCookiePath() });
}
