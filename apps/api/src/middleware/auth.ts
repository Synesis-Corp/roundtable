import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ACCESS_TTL } from '../lib/refresh-token';

/**
 * Resolves the JWT signing secret at call time. There is NO insecure default:
 * a missing or short secret aborts instead of silently signing tokens with a
 * public, repo-known fallback. Read lazily (not at module load) so tests and
 * tooling can set the env var before the first sign/verify.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid token' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(userId: string, email?: string): string {
  // Short-lived access token; the refresh-token cookie flow renews it.
  return jwt.sign({ userId, ...(email ? { email } : {}) }, getJwtSecret(), {
    expiresIn: ACCESS_TTL,
  });
}
