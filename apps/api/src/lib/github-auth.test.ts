import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchPrimaryEmail,
  generateState,
} from './github-auth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildAuthorizeUrl', () => {
  it('constructs a valid GitHub authorize URL with all required params', () => {
    const url = buildAuthorizeUrl(
      'state-abc',
      'https://app.test/api/auth/github/callback',
      'client-123'
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.test/api/auth/github/callback'
    );
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('scope')).toBe('user:email');
  });
});

describe('generateState', () => {
  it('returns a 64-char hex string (32 bytes)', () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique values on each call', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});

describe('exchangeCodeForToken', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs to the token URL with form-encoded body and returns the access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'gho_abc123', token_type: 'bearer', scope: 'user:email' })
      );
    const token = await exchangeCodeForToken(
      'the-code',
      'https://app.test/cb',
      'client-123',
      'secret-xyz',
      fetchMock as unknown as typeof fetch
    );
    expect(token).toBe('gho_abc123');
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://github.com/login/oauth/access_token');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as string;
    expect(body).toContain('client_id=client-123');
    expect(body).toContain('client_secret=secret-xyz');
    expect(body).toContain('code=the-code');
    expect(body).toContain('redirect_uri=https%3A%2F%2Fapp.test%2Fcb');
  });

  it('throws when GitHub returns a non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500));
    await expect(
      exchangeCodeForToken('c', 'https://x/cb', 'id', 'sec', fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when GitHub returns a 200 with an error field (OAuth2 error envelope)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'bad_verification_code', error_description: 'code expired' })
      );
    await expect(
      exchangeCodeForToken(
        'expired',
        'https://x/cb',
        'id',
        'sec',
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow(/bad_verification_code/);
  });

  it('throws when the response is 200 but missing access_token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ token_type: 'bearer' }));
    await expect(
      exchangeCodeForToken('c', 'https://x/cb', 'id', 'sec', fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/missing access_token/);
  });
});

describe('fetchGitHubUser', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GETs /user with the bearer token and returns the parsed body', async () => {
    const user = {
      id: 12345,
      login: 'octocat',
      name: 'The Octocat',
      email: '[email protected]',
      avatar_url: 'https://gh/ava',
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(user));
    const out = await fetchGitHubUser('gho_abc', fetchMock as unknown as typeof fetch);
    expect(out).toEqual(user);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://github.com/user');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gho_abc');
  });

  it('preserves email=null (the caller must fall back to /user/emails)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: 1, login: 'private', name: null, email: null, avatar_url: null })
      );
    const out = await fetchGitHubUser('tok', fetchMock as unknown as typeof fetch);
    expect(out.email).toBeNull();
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(fetchGitHubUser('bad', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /HTTP 401/
    );
  });
});

describe('fetchPrimaryEmail', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the primary verified email from the emails array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        { email: '[email protected]', primary: false, verified: true, visibility: 'public' },
        { email: '[email protected]', primary: true, verified: true, visibility: null },
        { email: '[email protected]', primary: false, verified: false, visibility: null },
      ])
    );
    const out = await fetchPrimaryEmail('tok', fetchMock as unknown as typeof fetch);
    expect(out).toBe('[email protected]');
  });

  it('returns null when no email is primary+verified', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          { email: '[email protected]', primary: true, verified: false, visibility: null },
        ])
      );
    const out = await fetchPrimaryEmail('tok', fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
  });

  it('returns null when the emails array is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    const out = await fetchPrimaryEmail('tok', fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 403));
    await expect(fetchPrimaryEmail('tok', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      /HTTP 403/
    );
  });
});
