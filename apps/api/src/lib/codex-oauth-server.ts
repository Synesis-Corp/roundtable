import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { prisma } from '../lib/db';
import { encrypt } from '@chat/crypto';
import { logger } from '../lib/logger';
import {
  CODEX_API_BASE_URL,
  CODEX_OAUTH_PORT,
  createCodexCredential,
  exchangeCodexCode,
  type PkceCodes,
} from '../lib/codex-auth';

interface PendingCodexOAuth {
  userId: string;
  pkce: PkceCodes;
  createdAt: number;
}

const pendingCodexOAuth = new Map<string, PendingCodexOAuth>();
let codexOAuthServer: ReturnType<typeof createServer> | null = null;

function getWebAppUrl(): string {
  return (process.env.WEB_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
}

function redirectToSettings(res: ServerResponse, params: Record<string, string>): void {
  const url = new URL('/settings', getWebAppUrl());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  res.writeHead(302, { Location: url.toString() });
  res.end();
}

async function handleCodexOAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${CODEX_OAUTH_PORT}`);
  if (url.pathname !== '/auth/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    redirectToSettings(res, { provider: 'openai', codex: 'error', message: error });
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    redirectToSettings(res, { provider: 'openai', codex: 'error', message: 'missing_code' });
    return;
  }

  const pending = pendingCodexOAuth.get(state);
  pendingCodexOAuth.delete(state);
  if (!pending || Date.now() - pending.createdAt > 5 * 60 * 1000) {
    redirectToSettings(res, { provider: 'openai', codex: 'error', message: 'expired_state' });
    return;
  }

  try {
    const tokens = await exchangeCodexCode(code, pending.pkce);
    const credential = createCodexCredential(tokens);
    const options = JSON.stringify({ authType: 'codex', baseURL: CODEX_API_BASE_URL });

    await prisma.providerConfig.upsert({
      where: {
        userId_providerId: {
          userId: pending.userId,
          providerId: 'openai',
        },
      },
      update: {
        encryptedApiKey: encrypt(JSON.stringify(credential)),
        maskedKey: 'ChatGPT Plus/Pro',
        isActive: true,
        options,
      },
      create: {
        userId: pending.userId,
        providerId: 'openai',
        encryptedApiKey: encrypt(JSON.stringify(credential)),
        maskedKey: 'ChatGPT Plus/Pro',
        isActive: true,
        options,
      },
    });

    redirectToSettings(res, { provider: 'openai', codex: 'connected' });
  } catch (err) {
    logger.error({ err }, 'providers: codex OAuth callback failed');
    redirectToSettings(res, { provider: 'openai', codex: 'error', message: 'callback_failed' });
  }
}

export async function ensureCodexOAuthServer(): Promise<void> {
  if (codexOAuthServer?.listening) return;

  codexOAuthServer = createServer((req, res) => {
    void handleCodexOAuthRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    codexOAuthServer!.once('error', reject);
    codexOAuthServer!.listen(CODEX_OAUTH_PORT, () => {
      codexOAuthServer!.off('error', reject);
      resolve();
    });
  }).catch((err) => {
    codexOAuthServer = null;
    throw err;
  });
}

export { pendingCodexOAuth };
