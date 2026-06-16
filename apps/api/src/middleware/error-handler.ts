import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/** Terminal 404 for unmatched routes — keeps the JSON error shape consistent. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Last-resort error handler. Logs the real error server-side but never leaks
 * stack traces or internals to the client. Must be registered AFTER all routes
 * (Express identifies it by its 4-arg signature).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Prefer the per-request child logger (carries the correlation id); fall back
  // to the base logger if the request never went through the http logger.
  const log = (req as Request & { log?: typeof logger }).log ?? logger;
  log.error({ err }, 'unhandled error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}
