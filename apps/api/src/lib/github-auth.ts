import { randomBytes } from "node:crypto";

/** Shape returned by GitHub's `/user` endpoint. Only the fields we use. */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * GitHub OAuth helpers. Mirrors `lib/refresh-token.ts` in style: pure functions
 * over `globalThis.fetch` so they can be unit-tested with a single `vi.stubGlobal`
 * and reused in any context. No `prisma` or `express` dependency.
 */

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

/**
 * Returns the GitHub authorize URL the frontend should redirect (or popup) to.
 * The `state` is a random opaque value stored in a short-lived cookie and
 * validated on the callback to prevent CSRF (the OAuth 2.0 spec requires it).
 *
 * `scope=user:email` is the minimum to read the user's primary verified email
 * via `/user/emails` when `/user` returns `email: null` (the user has chosen
 * to keep their email private on GitHub).
 */
export function buildAuthorizeUrl(state: string, redirectUri: string, clientId: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "user:email");
  // `allow_signup=true` is the default; spelled out for clarity.
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

/** Generates a 32-byte hex opaque state for CSRF protection. */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Exchanges the authorization `code` for an access token via GitHub's token
 * endpoint. Returns the raw access token string. Throws on any non-2xx or
 * when the response body lacks `access_token` (GitHub returns errors as
 * 200 + JSON with `error` field — we treat that as failure too).
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as TokenResponse;
  if (data.error || !data.access_token) {
    throw new Error(
      `GitHub token exchange failed: ${data.error ?? "missing access_token"}${data.error_description ? " — " + data.error_description : ""}`,
    );
  }
  return data.access_token;
}

/**
 * Fetches the authenticated user's public profile. Note: `email` may be
 * `null` if the user has chosen to keep their email private. Callers
 * should fall back to `fetchPrimaryEmail` in that case.
 */
export async function fetchGitHubUser(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubUser> {
  const res = await fetchImpl(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "roundtable-ai",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub /user failed: HTTP ${res.status}`);
  }

  return (await res.json()) as GitHubUser;
}

/**
 * Returns the user's primary verified email, or `null` if they have no
 * verified email at all. GitHub returns the `emails` array sorted with
 * `primary` first when one exists, but we don't trust that ordering —
 * we filter explicitly.
 */
export async function fetchPrimaryEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(GITHUB_EMAILS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "roundtable-ai",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub /user/emails failed: HTTP ${res.status}`);
  }

  const emails = (await res.json()) as GitHubEmail[];
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}
