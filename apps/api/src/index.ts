import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from the first place it exists: the current dir or the monorepo
// root. Makes `pnpm --filter @chat/api dev` (CWD=apps/api) behave the same as
// running from the repo root. In Docker the vars come from the environment, so
// a missing file is harmless.
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { validateEnv, corsOrigins } from './config/env';
import { prisma } from './lib/db';
import { logger, httpLogger } from './lib/logger';
import { notFoundHandler, errorHandler } from './middleware/error-handler';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import multiRoutes from './routes/multi';
import councilRoutes from './routes/council';
import councilConfigRoutes from './routes/council-config';
import conversationRoutes from './routes/conversations';
import providerRoutes, { capabilityRegistryReady } from './routes/providers';
import usageRoutes from './routes/usage';
import memoryRoutes from './routes/memory';
import adminRoutes from './routes/admin';
import { initializePricing } from './lib/model-pricing';

export const app = express();
const PORT = process.env.PORT ?? 4000;

// Number of reverse-proxy hops in front of the API, so Express reads the real
// client IP from X-Forwarded-For (critical for express-rate-limit per-client
// buckets, not one global bucket) and the protocol from X-Forwarded-Proto.
// Configurable so the SAME image is portable across topologies:
//   - container nginx exposed directly        → TRUST_PROXY=1 (default)
//   - behind a host nginx too (e.g. shared box) → TRUST_PROXY=2
// The value is the count of trusted hops from the right, so a client cannot
// spoof its IP by injecting its own X-Forwarded-For header.
const trustProxyHops = Number(process.env.TRUST_PROXY ?? 1);
app.set(
  'trust proxy',
  Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1
);

// Skip limits under test so the integration suite can fire many requests.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Strict limit on auth: brute-force / credential-stuffing surface.
// Only applied to login, register, and OAuth endpoints — not to
// refresh, sessions, or profile (those are called automatically by
// the frontend and would exhaust the bucket on normal usage).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) =>
    skipInTest() ||
    !['/auth/login', '/auth/register', '/auth/google'].includes(req.path),
  message: { error: 'Too many authentication attempts, try again later' },
});

// Looser limit on chat: protects providers/cost from request floods.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many requests, slow down' },
});

app.use(helmet());
app.use(cors({ origin: corsOrigins(), credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Per-request structured logging + correlation id (x-request-id). Adds req.log.
app.use(httpLogger);

// Liveness — process is up. Cheap, no dependencies.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness — can we actually serve traffic (DB reachable)?
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', db: 'down' });
  }
});

app.use('/auth', authLimiter, authRoutes);
app.use('/chat', chatLimiter, chatRoutes);
app.use('/chat', chatLimiter, multiRoutes);
app.use('/chat', chatLimiter, councilRoutes);
app.use('/council/config', chatLimiter, councilConfigRoutes);
app.use('/conversations', conversationRoutes);
app.use('/providers', providerRoutes);
app.use('/usage', usageRoutes);
app.use('/memory', memoryRoutes);
app.use('/admin', adminRoutes);

// Terminal handlers — must come after all routes.
app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  validateEnv();

  capabilityRegistryReady.then(() => {
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, `API server running on http://localhost:${PORT}`);
    });

    // Initialize pricing cache asynchronously (non-blocking)
    initializePricing()
      .then(() => {
        logger.info('Pricing cache initialized');
      })
      .catch((err) => {
        logger.warn({ err }, 'Failed to initialize pricing cache — using static fallback');
      });

    const shutdown = (signal: string) => {
      logger.info({ signal }, `${signal} received — shutting down gracefully`);
      server.close(() => {
        void prisma.$disconnect().finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}
