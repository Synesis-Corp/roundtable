import { prisma } from './db';
import { getProvider } from './provider-registry';
import { resolveProviderCredential } from './provider-credentials';

/** Health status for a single provider. `checkedAt` is epoch ms. */
export interface ProviderHealth {
  ok: boolean;
  error?: string;
  checkedAt: number;
}

/** Result of a liveness probe before it's stamped with `checkedAt`. */
export type HealthCheckResult = { ok: boolean; error?: string };

/** Performs the actual liveness probe for one (user, provider) pair. */
export type HealthChecker = (userId: string, providerId: string) => Promise<HealthCheckResult>;

const DEFAULT_TTL_MS = 60_000;

/**
 * A TTL cache around an injectable {@link HealthChecker}. Splitting the cache
 * from the probe keeps the cache logic testable without mocking the provider
 * stack, and lets the route share a single process-wide instance so a real
 * `chat("Hi")` probe (which costs tokens) runs at most once per TTL window.
 */
export function createHealthCache(checker: HealthChecker, ttlMs: number = DEFAULT_TTL_MS) {
  const cache = new Map<string, ProviderHealth>();

  async function check(
    userId: string,
    providerId: string,
    now: number = Date.now()
  ): Promise<ProviderHealth> {
    const key = `${userId}:${providerId}`;
    const cached = cache.get(key);
    if (cached && now - cached.checkedAt < ttlMs) return cached;
    const result = await checker(userId, providerId);
    const entry: ProviderHealth = { ...result, checkedAt: now };
    cache.set(key, entry);
    return entry;
  }

  async function checkMany(
    userId: string,
    providerIds: string[],
    now: number = Date.now()
  ): Promise<Record<string, ProviderHealth>> {
    const entries = await Promise.all(
      providerIds.map(async (id) => [id, await check(userId, id, now)] as const)
    );
    return Object.fromEntries(entries);
  }

  return {
    check,
    checkMany,
    clear: () => cache.clear(),
  };
}

/**
 * Production probe: resolves the stored credential and runs a minimal
 * `chat("Hi")` round-trip — the only liveness signal the ProviderPlugin
 * interface exposes. Any failure is mapped to `{ ok: false, error }`.
 */
const realChecker: HealthChecker = async (userId, providerId) => {
  try {
    const config = await prisma.providerConfig.findUnique({
      where: { userId_providerId: { userId, providerId } },
    });
    if (!config) return { ok: false, error: 'Provider not configured' };

    const credential = await resolveProviderCredential(config, prisma);
    const provider = getProvider(providerId, credential.options);
    if (!provider) return { ok: false, error: 'Provider not available' };

    await provider.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
        model: provider.getCapabilities()[0]?.modelId ?? '',
      },
      credential.apiKey
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Health check failed' };
  }
};

/** Process-wide health cache used by the `GET /providers/health` route. */
export const providerHealthCache = createHealthCache(realChecker);
