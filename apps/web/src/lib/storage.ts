/**
 * Storage abstraction for the web app.
 *
 * Wraps `window.localStorage` behind a small interface so the rest of the app
 * never touches the browser API directly. This buys us:
 *  - testability (swap in {@link MemoryStorageAdapter})
 *  - resilience: if localStorage is unavailable (private mode, disabled cookies)
 *    or throws (QuotaExceededError, SecurityError), we degrade to an in-memory
 *    store instead of crashing the app.
 */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** In-memory adapter — used as a fallback and in tests. */
export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  get(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

/**
 * localStorage-backed adapter with a memory fallback. If localStorage is
 * unavailable at construction, or a write later fails (e.g. quota exceeded),
 * the adapter flips to its in-memory store for the rest of the session.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly fallback = new MemoryStorageAdapter();
  private useFallback: boolean;

  constructor() {
    this.useFallback = !isLocalStorageAvailable();
  }

  get(key: string): string | null {
    if (this.useFallback) return this.fallback.get(key);
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.fallback.get(key);
    }
  }

  set(key: string, value: string): void {
    if (this.useFallback) {
      this.fallback.set(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or access denied — degrade to memory permanently so we
      // stay consistent for subsequent reads in this session.
      this.useFallback = true;
      this.fallback.set(key, value);
    }
  }

  remove(key: string): void {
    if (this.useFallback) {
      this.fallback.remove(key);
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      this.fallback.remove(key);
    }
  }
}

/** Feature-detect a usable localStorage (private mode can throw on write). */
function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__storage_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** App-wide storage singleton. Import this instead of touching localStorage. */
export const storage: StorageAdapter = new LocalStorageAdapter();
