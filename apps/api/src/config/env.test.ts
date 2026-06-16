import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAdminEmails } from './env';

const OLD_ENV = process.env;

describe('getAdminEmails', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns empty set when ADMIN_EMAILS is unset', () => {
    expect(getAdminEmails().size).toBe(0);
  });

  it('returns empty set when ADMIN_EMAILS is empty string', () => {
    process.env.ADMIN_EMAILS = '';
    expect(getAdminEmails().size).toBe(0);
  });

  it('returns empty set when ADMIN_EMAILS is only commas', () => {
    process.env.ADMIN_EMAILS = ' , , ';
    expect(getAdminEmails().size).toBe(0);
  });

  it('parses a single email', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const result = getAdminEmails();
    expect(result.size).toBe(1);
    expect(result.has('admin@example.com')).toBe(true);
  });

  it('parses comma-separated emails', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com, another@test.com';
    const result = getAdminEmails();
    expect(result.size).toBe(2);
    expect(result.has('admin@example.com')).toBe(true);
    expect(result.has('another@test.com')).toBe(true);
  });

  it('trims whitespace', () => {
    process.env.ADMIN_EMAILS = '  admin@example.com  ,  another@test.com  ';
    const result = getAdminEmails();
    expect(result.size).toBe(2);
    expect(result.has('admin@example.com')).toBe(true);
    expect(result.has('another@test.com')).toBe(true);
  });

  it('lowercases all emails', () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.COM, Another@Test.Com';
    const result = getAdminEmails();
    expect(result.size).toBe(2);
    expect(result.has('admin@example.com')).toBe(true);
    expect(result.has('another@test.com')).toBe(true);
  });
});
