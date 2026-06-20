import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';

// requireAdmin now does a DB lookup to confirm the admin account actually OWNS
// its email (via a verified OAuth link), so we mock the prisma client. Use
// vi.hoisted so the spy exists before vi.mock's factory runs.
const { mockUserFindUnique } = vi.hoisted(() => ({ mockUserFindUnique: vi.fn() }));
vi.mock('../lib/db', () => ({
  prisma: { user: { findUnique: mockUserFindUnique } },
}));

import { requireAdmin } from './admin';

const OLD_ENV = process.env;

function mockReqRes(opts: { email?: string; userId?: string } = {}) {
  const req = { userEmail: opts.email, userId: opts.userId } as AuthenticatedRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

/** Verified-ownership admin: in the allowlist AND linked to an OAuth identity. */
const OAUTH_ADMIN = { email: 'admin@example.com', googleId: 'g-sub-123', githubId: null };

describe('requireAdmin', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ADMIN_EMAILS;
    mockUserFindUnique.mockReset();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('calls next() for an allowlisted email on an OAuth-verified (Google) account', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    mockUserFindUnique.mockResolvedValue(OAUTH_ADMIN);
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts a GitHub-linked account too', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    mockUserFindUnique.mockResolvedValue({
      email: 'admin@example.com',
      googleId: null,
      githubId: '42',
    });
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  // THE FIX: registration is open and unverified, so an allowlisted email on a
  // password-only account (no OAuth link) must NOT be granted admin — otherwise
  // anyone could register an unclaimed admin email and escalate.
  it('returns 403 for an allowlisted email on a password-only account (escalation guard)', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    mockUserFindUnique.mockResolvedValue({
      email: 'admin@example.com',
      googleId: null,
      githubId: null,
    });
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'squatter' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 403 when email is not in the allowlist (no DB lookup needed)', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const { req, res, next } = mockReqRes({ email: 'user@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns 403 when the allowlist is empty', async () => {
    const { req, res, next } = mockReqRes({ email: 'any@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when userEmail is undefined', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const { req, res, next } = mockReqRes({ email: undefined, userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('matches the allowlist case-insensitively (OAuth-verified)', async () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com';
    mockUserFindUnique.mockResolvedValue({
      email: 'admin@example.com',
      googleId: 'g',
      githubId: null,
    });
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('fails closed (403) when the account no longer exists', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    mockUserFindUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'ghost' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('fails closed (403) on a DB error', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    mockUserFindUnique.mockRejectedValue(new Error('db down'));
    const { req, res, next } = mockReqRes({ email: 'admin@example.com', userId: 'u1' });

    await requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
