import { describe, it, expect, vi } from 'vitest';
import { createHealthCache, type HealthChecker } from './provider-health';

describe('createHealthCache', () => {
  it('calls the checker on a cold miss and returns the result with checkedAt', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: true }));
    const cache = createHealthCache(checker, 60_000);

    const res = await cache.check('u1', 'openai', 1_000);

    expect(checker).toHaveBeenCalledTimes(1);
    expect(checker).toHaveBeenCalledWith('u1', 'openai');
    expect(res).toEqual({ ok: true, checkedAt: 1_000 });
  });

  it('returns the cached result within the TTL without re-calling the checker', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: true }));
    const cache = createHealthCache(checker, 60_000);

    await cache.check('u1', 'openai', 1_000);
    const second = await cache.check('u1', 'openai', 1_000 + 59_999);

    expect(checker).toHaveBeenCalledTimes(1);
    expect(second.checkedAt).toBe(1_000); // still the original entry
  });

  it('re-checks once the TTL has elapsed', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: true }));
    const cache = createHealthCache(checker, 60_000);

    await cache.check('u1', 'openai', 1_000);
    const second = await cache.check('u1', 'openai', 1_000 + 60_000);

    expect(checker).toHaveBeenCalledTimes(2);
    expect(second.checkedAt).toBe(61_000);
  });

  it('caches and passes through an error result', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: false, error: 'API key invalid' }));
    const cache = createHealthCache(checker, 60_000);

    const res = await cache.check('u1', 'openai', 1_000);
    await cache.check('u1', 'openai', 1_500);

    expect(res).toEqual({ ok: false, error: 'API key invalid', checkedAt: 1_000 });
    expect(checker).toHaveBeenCalledTimes(1);
  });

  it('keys the cache per user + provider', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: true }));
    const cache = createHealthCache(checker, 60_000);

    await cache.check('u1', 'openai', 1_000);
    await cache.check('u2', 'openai', 1_000);
    await cache.check('u1', 'anthropic', 1_000);

    expect(checker).toHaveBeenCalledTimes(3);
  });

  it('checkMany resolves every provider in parallel and returns a status map', async () => {
    const checker = vi.fn<HealthChecker>(async (_u, providerId) =>
      providerId === 'openai' ? { ok: true } : { ok: false, error: 'down' }
    );
    const cache = createHealthCache(checker, 60_000);

    const map = await cache.checkMany('u1', ['openai', 'anthropic'], 2_000);

    expect(map).toEqual({
      openai: { ok: true, checkedAt: 2_000 },
      anthropic: { ok: false, error: 'down', checkedAt: 2_000 },
    });
  });

  it('clear() forces a re-check on the next call', async () => {
    const checker = vi.fn<HealthChecker>(async () => ({ ok: true }));
    const cache = createHealthCache(checker, 60_000);

    await cache.check('u1', 'openai', 1_000);
    cache.clear();
    await cache.check('u1', 'openai', 1_000);

    expect(checker).toHaveBeenCalledTimes(2);
  });
});
