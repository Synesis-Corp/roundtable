import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Keys that must NEVER reach the logs. The "API key in logs" bug already
 * happened once (openai-compatible.ts logged `apiKey.substring(0,10)`), so
 * redaction is non-negotiable. Paths cover top-level and one-nested-level
 * occurrences plus the request headers that carry credentials.
 */
const redactPaths = [
  'apiKey',
  'api_key',
  'apikey',
  'password',
  'passwordHash',
  'encryptedApiKey',
  'credential',
  'credentials',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.apiKey',
  '*.password',
  '*.token',
  '*.credential',
  '*.encryptedApiKey',
];

/**
 * Base structured logger. JSON everywhere (ingestion-friendly). Silenced under
 * test so the vitest output stays clean. Level overridable via LOG_LEVEL.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  enabled: !isTest,
});

/**
 * Express middleware: per-request child logger with a correlation id. Honors an
 * inbound `x-request-id` (proxy/tracing) or mints a UUID, and echoes it back on
 * the response. Health/readiness probes are not auto-logged to cut noise.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id = (Array.isArray(inbound) ? inbound[0] : inbound) ?? randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/ready',
  },
});
