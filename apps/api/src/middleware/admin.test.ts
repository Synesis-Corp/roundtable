import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import { requireAdmin } from './admin';
import type { AuthenticatedRequest } from './auth';

const OLD_ENV = process.env;

function mockReqRes(email?: string) {
  const req = {
    userEmail: email,
  } as AuthenticatedRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('requireAdmin', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('calls next() when email is in allowlist', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const { req, res, next } = mockReqRes('admin@example.com');

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when email is not in allowlist', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const { req, res, next } = mockReqRes('user@example.com');

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 403 when allowlist is empty', () => {
    const { req, res, next } = mockReqRes('any@example.com');

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 403 when userEmail is undefined', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const { req, res, next } = mockReqRes(undefined);

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com';
    const { req, res, next } = mockReqRes('admin@example.com');

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
