import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';
import { getAdminEmails } from '../config/env';

/**
 * Middleware that requires the authenticated user to be in the ADMIN_EMAILS
 * allowlist. Must run AFTER authMiddleware so req.userEmail is populated.
 *
 * Returns 403 if the user's email is not in the allowlist, or if ADMIN_EMAILS
 * is not configured (empty allowlist = no admins).
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const email = req.userEmail?.toLowerCase();
  if (!email || !getAdminEmails().has(email)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
