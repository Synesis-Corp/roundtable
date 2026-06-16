import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';
import { PROVIDERS_CHANGED_EVENT } from '../lib/provider-events';
import { useSettings } from './useSettings';

// ─── In-memory storage stub ───────────────────────────────────────────────────

const { storeRef, storageStub } = vi.hoisted(() => {
  let currentStore: Map<string, string> = new Map();

  const ref = {
    reset: () => {
      currentStore = new Map();
    },
    get: (k: string): string | null => currentStore.get(k) ?? null,
    set: (k: string, v: string) => {
      currentStore.set(k, v);
    },
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
  return { ...original, storage: storageStub };
});

// ─── Mock apiGet, apiPost, apiDelete ──────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());

vi.mock('../lib/api-client', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiDelete: mockApiDelete,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useSettings.handleConnect — onboarding flag clearing', () => {
  beforeEach(() => {
    storeRef.reset();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();

    // Simulate an authenticated session
    storeRef.set('token', 'test-token');

    // GET /providers returns empty list initially
    mockApiGet.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears IS_NEW_KEY after handleConnect succeeds (POST /providers returns 201)', async () => {
    // Arrange: flag is set (user is new)
    storeRef.set(IS_NEW_KEY, '1');

    // POST /providers succeeds (resolves with undefined — the hook only awaits it)
    mockApiPost.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSettings());

    // Wait for initial fetch to settle
    await act(async () => {});

    expect(storeRef.get(IS_NEW_KEY)).toBe('1');

    // Act: connect a provider
    await act(async () => {
      await result.current.handleConnect('openai', 'sk-abc123');
    });

    // Assert: flag was cleared
    expect(storeRef.get(IS_NEW_KEY)).toBeNull();
  });

  it('does NOT clear IS_NEW_KEY when handleConnect fails', async () => {
    // Arrange: flag is set
    storeRef.set(IS_NEW_KEY, '1');

    // POST /providers fails
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSettings());

    // Wait for initial fetch to settle
    await act(async () => {});

    expect(storeRef.get(IS_NEW_KEY)).toBe('1');

    // Act: attempt connection that fails
    await act(async () => {
      await result.current.handleConnect('openai', 'sk-bad');
    });

    // Assert: flag is still present
    expect(storeRef.get(IS_NEW_KEY)).toBe('1');
  });
});

describe('useSettings — providers-changed event emission', () => {
  let dispatchSpy: Mock<[Event], boolean>;
  let originalDispatchEvent: typeof window.dispatchEvent;

  beforeEach(() => {
    storeRef.reset();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();

    storeRef.set('token', 'test-token');
    mockApiGet.mockResolvedValue([]);

    // Spy on window.dispatchEvent by wrapping the original. The
    // `vi.spyOn(window, "dispatchEvent")` form has a complex generic that
    // fights the project's tsconfig, so the manual wrap is simpler and
    // equivalent for asserting calls.
    originalDispatchEvent = window.dispatchEvent.bind(window);
    dispatchSpy = vi.fn((event: Event) => originalDispatchEvent(event));
    window.dispatchEvent = dispatchSpy as unknown as typeof window.dispatchEvent;
  });

  afterEach(() => {
    window.dispatchEvent = originalDispatchEvent;
  });

  /** Helper: filter the spy calls to just providers-changed events. */
  function providersChangedCalls(): CustomEvent[] {
    return dispatchSpy.mock.calls
      .map((args) => (args as [Event])[0])
      .filter(
        (e): e is CustomEvent => e instanceof CustomEvent && e.type === PROVIDERS_CHANGED_EVENT
      );
  }

  it('handleConnect success emits PROVIDERS_CHANGED_EVENT', async () => {
    mockApiPost.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSettings());
    await act(async () => {});

    expect(providersChangedCalls()).toHaveLength(0);

    await act(async () => {
      await result.current.handleConnect('openai', 'sk-abc123');
    });

    expect(providersChangedCalls()).toHaveLength(1);
  });

  it('handleConnect failure does NOT emit PROVIDERS_CHANGED_EVENT', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSettings());
    await act(async () => {});

    await act(async () => {
      await result.current.handleConnect('openai', 'sk-bad');
    });

    expect(providersChangedCalls()).toHaveLength(0);
  });

  it('handleDisconnectConfirmed success emits PROVIDERS_CHANGED_EVENT', async () => {
    // Set up a connected provider so requestDisconnect can resolve it.
    mockApiGet.mockResolvedValueOnce([
      {
        id: 'up-1',
        providerId: 'openai',
        apiKey: 'encrypted-blob',
        maskedKey: 'sk-***1234',
        options: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { result } = renderHook(() => useSettings());
    await act(async () => {});

    // Stage a pending disconnect
    act(() => {
      result.current.requestDisconnect('openai');
    });

    mockApiDelete.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.handleDisconnectConfirmed();
    });

    expect(providersChangedCalls()).toHaveLength(1);
  });
});
