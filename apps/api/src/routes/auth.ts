import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { RegisterSchema, LoginSchema, GoogleAuthSchema } from '@chat/sdk';
import { prisma } from '../lib/db';
import { signToken, authMiddleware } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  REFRESH_COOKIE_NAME,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} from '../lib/refresh-token';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchPrimaryEmail,
  generateState,
} from '../lib/github-auth';
import { refreshCookiePath } from '../lib/refresh-token';

const router = Router();
const googleClient = new OAuth2Client();

/** Persists a new refresh token (hashed), captures session metadata, and sets the cookie. */
async function issueRefreshCookie(res: Response, userId: string, req?: Request): Promise<void> {
  const { raw, hash, expiresAt } = generateRefreshToken();
  const userAgent = req?.headers?.['user-agent']?.slice(0, 500) ?? null;
  const ip = req?.ip ?? null;
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash, expiresAt, userAgent, ip },
  });
  setRefreshCookie(res, raw);
}

// ─── GitHub OAuth state cookie ──────────────────────────────────────────────
// Short-lived, httpOnly, SameSite=Lax. Holds the CSRF `state` value the
// authorize step set; the callback compares it with `req.query.state` to
// prevent forged callbacks. 10 minutes is the GitHub-recommended window.
const GITHUB_STATE_COOKIE = 'github_oauth_state';
const GITHUB_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function setGitHubStateCookie(res: Response, state: string): void {
  res.cookie(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax', // "strict" would block the GitHub → our callback redirect
    secure: process.env.NODE_ENV === 'production',
    path: refreshCookiePath(),
    maxAge: GITHUB_STATE_MAX_AGE_MS,
  });
}

function clearGitHubStateCookie(res: Response): void {
  res.clearCookie(GITHUB_STATE_COOKIE, { path: refreshCookiePath() });
}

/**
 * HTML page returned by the GitHub callback. Posts the JWT (or error) to the
 * popup opener via `window.opener.postMessage` and closes itself. The
 * frontend (`oauth-popup.ts`) listens for the message and reacts.
 */
function oauthCallbackHtml(payload: {
  type: 'oauth-success' | 'oauth-error';
  token?: string;
  error?: string;
  created?: boolean;
}): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in</title></head><body><script>
    (function() {
      var msg = ${json};
      if (window.opener) {
        window.opener.postMessage(msg, window.location.origin);
      }
      window.close();
    })();
  </script></body></html>`;
}

router.post('/register', validateBody(RegisterSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken(user.id, user.email);
    await issueRefreshCookie(res, user.id, req);
    res.status(201).json({ token, user: { id: user.id, email: user.email }, created: true });
  } catch (err) {
    req.log.error({ err }, 'registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', validateBody(LoginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // No passwordHash = OAuth-only account (e.g. Google) — can't log in by password.
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken(user.id, user.email);
    await issueRefreshCookie(res, user.id, req);
    res.json({ token, user: { id: user.id, email: user.email }, created: false });
  } catch (err) {
    req.log.error({ err }, 'login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Sign in / sign up with Google. The frontend sends the ID token (credential)
// from Google Identity Services; we verify it server-side, then find-or-create
// the user and issue OUR JWT (same token the rest of the app already uses).
router.post('/google', validateBody(GoogleAuthSchema), async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: 'Google sign-in is not configured' });
      return;
    }

    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true) {
      res.status(401).json({ error: 'Google account email not verified' });
      return;
    }

    const { sub: googleId, email, name } = payload;

    // Prefer matching by googleId; otherwise link to an existing email account.
    let created = false;
    let user = await prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId, name: byEmail.name ?? name },
        });
      } else {
        user = await prisma.user.create({ data: { email, googleId, name } });
        created = true;
      }
    }

    const token = signToken(user.id, user.email);
    await issueRefreshCookie(res, user.id, req);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name }, created });
  } catch (err) {
    req.log.error({ err }, 'google authentication failed');
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// Exchange a valid refresh cookie for a new access token. Rotates the refresh
// token (revoke the used one, issue a fresh cookie) to limit replay windows.
router.post('/refresh', async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw || typeof raw !== 'string') {
      res.status(401).json({ error: 'Missing refresh token' });
      return;
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(raw) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Rotation: revoke the consumed token, then mint a new pair.
    // Also update lastSeenAt on the old session so it reflects activity.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), lastSeenAt: new Date() },
    });
    await issueRefreshCookie(res, user.id, req);

    const token = signToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    req.log.error({ err }, 'token refresh failed');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Revoke the current refresh token and clear the cookie. Idempotent: a missing
// or already-revoked token still returns 204.
router.post('/logout', async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (raw && typeof raw === 'string') {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, 'logout failed');
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ─── GitHub OAuth (Authorization Code flow) ─────────────────────────────────
//
// Why not ID-token like Google? GitHub's OAuth2 implementation only supports
// the standard code flow (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
// The frontend opens a popup to /auth/github, the user authorizes on github.com,
// GitHub redirects the popup back to /auth/github/callback?code=X&state=Y, and
// we exchange the code server-side using the CLIENT_SECRET. The popup then
// receives the JWT via postMessage and closes.

/**
 * Step 1: redirect the popup to GitHub's authorize URL. Generates a random
 * `state` and stores it in an httpOnly cookie for CSRF protection on the
 * callback. Returns 503 if the operator hasn't configured GitHub.
 */
router.get('/github', (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: 'GitHub sign-in is not configured' });
    return;
  }

  // Build the callback URL from the configured WEB_URL. The path must match
  // the one registered in the GitHub OAuth App.
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  const callbackUrl = `${webUrl.replace(/\/$/, '')}/api/auth/github/callback`;

  const state = generateState();
  setGitHubStateCookie(res, state);
  res.redirect(buildAuthorizeUrl(state, callbackUrl, clientId));
});

/**
 * Step 2: exchange the code, fetch the user, find-or-create, return the
 * JWT via postMessage to the popup opener. The popup window is closed
 * server-side via the inline script.
 */
router.get('/github/callback', async (req: Request, res: Response) => {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      clearGitHubStateCookie(res);
      res
        .status(503)
        .type('html')
        .send(
          oauthCallbackHtml({ type: 'oauth-error', error: 'GitHub sign-in is not configured' })
        );
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateParam = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code) {
      clearGitHubStateCookie(res);
      res
        .status(400)
        .type('html')
        .send(oauthCallbackHtml({ type: 'oauth-error', error: 'Missing authorization code' }));
      return;
    }

    const stateCookie = req.cookies?.[GITHUB_STATE_COOKIE];
    // Constant-time comparison via string equality on equal-length hex strings
    // (both 64 chars). This is sufficient for CSRF state — not a secret.
    if (!stateCookie || stateCookie !== stateParam) {
      clearGitHubStateCookie(res);
      res
        .status(401)
        .type('html')
        .send(oauthCallbackHtml({ type: 'oauth-error', error: 'Invalid OAuth state' }));
      return;
    }
    clearGitHubStateCookie(res);

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    const callbackUrl = `${webUrl.replace(/\/$/, '')}/api/auth/github/callback`;

    const accessToken = await exchangeCodeForToken(code, callbackUrl, clientId, clientSecret);
    const ghUser = await fetchGitHubUser(accessToken);
    const githubId = String(ghUser.id);

    // GitHub may return `email: null` for users who keep their email private.
    // Fall back to the /user/emails endpoint and pick the primary verified one.
    let email = ghUser.email;
    if (!email) {
      email = await fetchPrimaryEmail(accessToken);
    }
    if (!email) {
      res
        .status(401)
        .type('html')
        .send(
          oauthCallbackHtml({ type: 'oauth-error', error: 'GitHub account email not verified' })
        );
      return;
    }

    // Find-or-create, mirror of the Google flow: by githubId first, then by
    // email (link to existing password account), else create.
    let ghCreated = false;
    let user = await prisma.user.findUnique({ where: { githubId } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { githubId, name: byEmail.name ?? ghUser.name ?? ghUser.login },
        });
      } else {
        user = await prisma.user.create({
          data: { email, githubId, name: ghUser.name ?? ghUser.login },
        });
        ghCreated = true;
      }
    }

    const token = signToken(user.id, user.email);
    await issueRefreshCookie(res, user.id, req);
    res
      .status(200)
      .type('html')
      .send(
        oauthCallbackHtml({
          type: 'oauth-success',
          token,
          created: ghCreated,
        })
      );
  } catch (err) {
    req.log.error({ err }, 'github oauth callback failed');
    res
      .status(502)
      .type('html')
      .send(oauthCallbackHtml({ type: 'oauth-error', error: 'GitHub authentication failed' }));
  }
});

router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId: req.userId!,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        lastSeenAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    res.json({ sessions });
  } catch (err) {
    req.log.error({ err }, 'sessions fetch failed');
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.delete('/sessions/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const session = await prisma.refreshToken.findUnique({
      where: { id: req.params.id },
    });
    if (!session || session.userId !== req.userId!) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, 'session revoke failed');
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

router.patch('/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { displayName, country, timezone, language } = req.body as {
      displayName?: string | null;
      country?: string | null;
      timezone?: string | null;
      language?: string | null;
    };

    const data: Record<string, string | null> = {};
    if (displayName !== undefined) data.displayName = displayName || null;
    if (country !== undefined) data.country = country || null;
    if (timezone !== undefined) data.timezone = timezone || null;
    if (language !== undefined) data.language = language || null;

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const user = await prisma.user.update({ where: { id: userId }, data });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      country: user.country,
      timezone: user.timezone,
      language: user.language,
    });
  } catch (err) {
    req.log.error({ err }, 'profile update failed');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        country: true,
        timezone: true,
        language: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    req.log.error({ err }, 'profile fetch failed');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
