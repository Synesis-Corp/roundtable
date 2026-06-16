import { createHash, randomBytes } from 'node:crypto';

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_ISSUER = 'https://auth.openai.com';
export const CODEX_API_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const CODEX_API_ENDPOINT = `${CODEX_API_BASE_URL}/responses`;
export const CODEX_OAUTH_PORT = 1455;
export const CODEX_REDIRECT_URI = `http://localhost:${CODEX_OAUTH_PORT}/auth/callback`;

export interface PkceCodes {
  verifier: string;
  challenge: string;
}

export interface CodexTokenResponse {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export interface CodexCredential {
  type: 'oauth';
  provider: 'openai-codex';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
}

interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
  };
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64url');
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return undefined;
  }
}

function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}

export function extractCodexAccountId(tokens: CodexTokenResponse): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token);
    const accountId = claims && extractAccountIdFromClaims(claims);
    if (accountId) return accountId;
  }

  const claims = parseJwtClaims(tokens.access_token);
  return claims ? extractAccountIdFromClaims(claims) : undefined;
}

export function generatePKCE(): PkceCodes {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function generateOAuthState(): string {
  return base64UrlEncode(randomBytes(32));
}

export function buildCodexAuthorizeUrl(pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'roundtable',
  });

  return `${CODEX_ISSUER}/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodexCode(
  code: string,
  pkce: PkceCodes
): Promise<CodexTokenResponse> {
  const response = await fetch(`${CODEX_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CODEX_REDIRECT_URI,
      client_id: CODEX_CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Codex token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<CodexTokenResponse>;
}

export async function refreshCodexAccessToken(refreshToken: string): Promise<CodexTokenResponse> {
  const response = await fetch(`${CODEX_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Codex token refresh failed: ${response.status}`);
  }

  return response.json() as Promise<CodexTokenResponse>;
}

export function createCodexCredential(tokens: CodexTokenResponse): CodexCredential {
  return {
    type: 'oauth',
    provider: 'openai-codex',
    refresh: tokens.refresh_token,
    access: tokens.access_token,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: extractCodexAccountId(tokens),
  };
}

export function isCodexCredential(value: unknown): value is CodexCredential {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<CodexCredential>).type === 'oauth' &&
    (value as Partial<CodexCredential>).provider === 'openai-codex' &&
    typeof (value as Partial<CodexCredential>).access === 'string' &&
    typeof (value as Partial<CodexCredential>).refresh === 'string'
  );
}

/**
 * Default `instructions` (system prompt) injected into Codex /responses
 * requests. The ChatGPT Codex backend rejects requests without a non-empty
 * `instructions` field ({"detail":"Instructions are required"}), and the AI SDK
 * omits it whenever the chat has no system message.
 */
const CODEX_DEFAULT_INSTRUCTIONS =
  'You are Roundtable, a helpful and knowledgeable assistant. Answer clearly and accurately.';

/**
 * Creates a fetch wrapper for the Codex (ChatGPT Plus/Pro) credential path.
 * Installed only for Codex providers, so every request here targets the ChatGPT
 * Codex backend. It performs the adaptations the AI SDK doesn't do on its own:
 *   1. Legacy: rewrites a /chat/completions URL to the Codex /responses endpoint.
 *   2. Adds the `originator` header the backend expects.
 *   3. Injects `instructions` (the backend returns 400 "Instructions are
 *      required" without it) and forces `store: false` (it rejects stored
 *      responses with 400 "Store must be set to false").
 * A non-OK response is logged so a future backend requirement change surfaces
 * instead of hanging the SSE stream silently (the symptom this code fixed).
 */
export function createCodexFetch(): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    const headers = {
      ...(init?.headers as Record<string, string> | undefined),
      originator: 'roundtable',
    };
    const target = urlStr.includes('/chat/completions') ? new URL(CODEX_API_ENDPOINT) : input;

    // Adapt the serialized Responses body to the Codex backend's requirements:
    //  - `instructions` must be present and non-empty.
    //  - `store` must be explicitly false (the backend rejects stored responses).
    let body = init?.body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          let changed = false;
          if (!parsed.instructions) {
            parsed.instructions = CODEX_DEFAULT_INSTRUCTIONS;
            changed = true;
          }
          if (parsed.store !== false) {
            parsed.store = false;
            changed = true;
          }
          if (changed) body = JSON.stringify(parsed);
        }
      } catch {
        // Non-JSON body (shouldn't happen for /responses) — leave untouched.
      }
    }

    const res = await fetch(target, { ...init, body, headers });
    if (!res.ok) {
      const detail = await res
        .clone()
        .text()
        .catch(() => '');
      console.error(`Codex backend rejected request: ${res.status} ${detail.slice(0, 300)}`);
    }
    return res;
  };
}
