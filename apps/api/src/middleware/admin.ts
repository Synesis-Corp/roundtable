import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';
import { getAdminEmails } from '../config/env';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';

/**
 * Requires the authenticated user to be an admin. Must run AFTER authMiddleware
 * so req.userId / req.userEmail are populated.
 *
 * Admin requires TWO conditions, not one:
 *  1. The email is in the ADMIN_EMAILS allowlist (operator intent).
 *  2. The account has PROVEN ownership of that email — it is linked to a verified
 *     OAuth identity (Google `email_verified` / GitHub primary verified email →
 *     googleId or githubId is set).
 *
 * Why (2): registration is open and does NOT verify email ownership, so an
 * allowlist match alone is exploitable — anyone could register an unclaimed
 * admin email and escalate to admin. Requiring a verified OAuth link closes the
 * hole: an attacker cannot OAuth as someone else's email.
 *
 * Fails CLOSED: any uncertainty (no user id, missing user, DB error) denies.
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const email = req.userEmail?.toLowerCase();
  if (!email || !req.userId || !getAdminEmails().has(email)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, googleId: true, githubId: true },
    });
    const emailOwned = !!user && getAdminEmails().has(user.email.toLowerCase());
    const oauthVerified = !!user && (Boolean(user.googleId) || Boolean(user.githubId));
    if (!emailOwned || !oauthVerified) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  } catch (err) {
    logger.error({ err }, 'requireAdmin: failed to verify admin ownership');
    res.status(403).json({ error: 'Forbidden' });
  }
}
