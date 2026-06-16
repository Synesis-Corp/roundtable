import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';
import { useOnboarding } from './useOnboarding';

// ─── In-memory store ──────────────────────────────────────────────────────────

// We avoid importing MemoryStorageAdapter from the mocked module to sidestep
// vi.mock hoisting issues. Instead we build a minimal in-memory store here
// whose reference is swappable per test.

type Store = Map<string, string>;

const { storeRef, storageStub } = vi.hoisted(() => {
  let currentStore: Store = new Map();

  const ref = {
    reset: () => {
      currentStore = new Map();
    },
    set: (k: string, v: string) => currentStore.set(k, v),
    get: (k: string): string | null => currentStore.get(k) ?? null,
    remove: (k: string) => {
      currentStore.delete(k);
    },
  };

  const stub = {
    get: (k: string) => ref.get(k),
    set: (k: string, v: string) => ref.set(k, v),
    remove: (k: string) => ref.remove(k),
  };

  return { storeRef: ref, storageStub: stub };
});

vi.mock('../lib/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/storage')>();
  return {
    ...original,
    storage: storageStub,
  };
});

// ─── Also mock clearIsNewFlag so it uses our stub storage ────────────────────
// clearIsNewFlag defaults to the real `storage` singleton; since we've mocked
// that module the default will correctly point to storageStub.

// ─── Sample provider ──────────────────────────────────────────────────────────

const oneProvider = [{ id: 'p1', providerId: 'openai', maskedKey: 'sk-...1234', isActive: true }];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useOnboarding', () => {
  beforeEach(() => {
    storeRef.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind=new when IS_NEW_KEY is set, providers empty, not loading', () => {
    storeRef.set(IS_NEW_KEY, '1');

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      })
    );

    expect(result.current.onboarding.kind).toBe('new');
  });

  it('clearIsNew() transitions kind to returning and removes the flag from storage', () => {
    storeRef.set(IS_NEW_KEY, '1');

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      })
    );

    expect(result.current.onboarding.kind).toBe('new');

    act(() => {
      result.current.clearIsNew();
    });

    expect(result.current.onboarding.kind).toBe('returning');
    expect(storeRef.get(IS_NEW_KEY)).toBeNull();
  });

  it('returns kind=hidden when providers are non-empty (flag irrelevant)', () => {
    storeRef.set(IS_NEW_KEY, '1');

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: oneProvider,
        userProvidersLoading: false,
        modelsLoading: false,
      })
    );

    expect(result.current.onboarding.kind).toBe('hidden');
  });

  it('returns kind=loading when userProvidersLoading is true', () => {
    storeRef.set(IS_NEW_KEY, '1');

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: [],
        userProvidersLoading: true,
        modelsLoading: false,
      })
    );

    expect(result.current.onboarding.kind).toBe('loading');
  });

  it('returns kind=returning when flag is absent and providers empty', () => {
    // storeRef was reset in beforeEach — IS_NEW_KEY is absent

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      })
    );

    expect(result.current.onboarding.kind).toBe('returning');
  });

  it('clearIsNew() is idempotent — calling twice does not throw', () => {
    storeRef.set(IS_NEW_KEY, '1');

    const { result } = renderHook(() =>
      useOnboarding({
        userProviders: [],
        userProvidersLoading: false,
        modelsLoading: false,
      })
    );

    act(() => {
      result.current.clearIsNew();
    });

    expect(() => {
      act(() => {
        result.current.clearIsNew();
      });
    }).not.toThrow();
  });
});
