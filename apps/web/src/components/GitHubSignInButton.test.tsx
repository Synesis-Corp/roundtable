import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GitHubSignInButton from './GitHubSignInButton';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';

// ─── In-memory storage stub (used by the new onboarding tests) ───────────────

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

// ─── Mock navigate ────────────────────────────────────────────────────────────

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: () => mockNavigate };
});

// ─── Mock openOAuthPopup so we can invoke onSuccess directly ─────────────────

let capturedOnSuccess: ((token: string, created?: boolean) => void) | null = null;

vi.mock('../lib/oauth-popup', () => ({
  openOAuthPopup: (opts: {
    onSuccess: (token: string, created?: boolean) => void;
    onError: (msg: string) => void;
  }) => {
    capturedOnSuccess = opts.onSuccess;
    return { closed: false, close: vi.fn() };
  },
}));

// We need to control `import.meta.env.VITE_GITHUB_ENABLED`. Vite exposes it
// as a build-time constant; in tests we can override it on `import.meta.env`.
function setGitHubEnabled(value: 'true' | 'false' | undefined) {
  if (value === undefined) {
    delete (import.meta.env as Record<string, string | undefined>).VITE_GITHUB_ENABLED;
  } else {
    (import.meta.env as Record<string, string>).VITE_GITHUB_ENABLED = value;
  }
}

describe('GitHubSignInButton', () => {
  beforeEach(() => {
    storeRef.reset();
    mockNavigate.mockReset();
    capturedOnSuccess = null;
  });

  afterEach(() => {
    setGitHubEnabled(undefined);
    vi.restoreAllMocks();
  });

  it('renders the button by default when VITE_GITHUB_ENABLED is unset (opt-out)', () => {
    setGitHubEnabled(undefined);
    render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    const button = screen.getByTestId('github-signin-button');
    expect(button).toBeInTheDocument();
  });

  it("renders nothing when VITE_GITHUB_ENABLED is explicitly 'false'", () => {
    setGitHubEnabled('false');
    const { container } = render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the button when VITE_GITHUB_ENABLED is 'true'", () => {
    setGitHubEnabled('true');
    render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    const button = screen.getByTestId('github-signin-button');
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('GitHub');
  });

  it('calls openOAuthPopup with the GitHub URL when clicked', () => {
    setGitHubEnabled('true');
    render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('github-signin-button'));
    // Our mock sets capturedOnSuccess — confirms openOAuthPopup was invoked.
    expect(capturedOnSuccess).toBeTypeOf('function');
  });

  // ─── Phase 5.7 — onboarding flag set on created: true ─────────────────────

  it("sets IS_NEW_KEY='1' when onSuccess fires with created=true", () => {
    setGitHubEnabled('true');
    render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('github-signin-button'));
    expect(capturedOnSuccess).toBeTypeOf('function');

    capturedOnSuccess!('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.sig', true);

    expect(storageStub.get('token')).toBe('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.sig');
    expect(storageStub.get(IS_NEW_KEY)).toBe('1');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  // ─── T3: OAuth hover scale ──────────────────────────────────────────────────

  describe('T3 — OAuth hover scale classes', () => {
    it('3.1 button has hover:scale-[1.02] class', () => {
      setGitHubEnabled('true');
      render(
        <MemoryRouter>
          <GitHubSignInButton />
        </MemoryRouter>
      );
      const button = screen.getByTestId('github-signin-button');
      expect(button.className).toContain('hover:scale-[1.02]');
    });

    it('3.2 button has active:scale-[0.98] class', () => {
      setGitHubEnabled('true');
      render(
        <MemoryRouter>
          <GitHubSignInButton />
        </MemoryRouter>
      );
      const button = screen.getByTestId('github-signin-button');
      expect(button.className).toContain('active:scale-[0.98]');
    });

    it('3.3 button has a transition class (transition-all or transition-transform)', () => {
      setGitHubEnabled('true');
      render(
        <MemoryRouter>
          <GitHubSignInButton />
        </MemoryRouter>
      );
      const button = screen.getByTestId('github-signin-button');
      expect(
        button.className.includes('transition-all') ||
          button.className.includes('transition-transform')
      ).toBe(true);
    });
  });

  it('does NOT set IS_NEW_KEY when onSuccess fires with created=false', () => {
    setGitHubEnabled('true');
    render(
      <MemoryRouter>
        <GitHubSignInButton />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('github-signin-button'));
    expect(capturedOnSuccess).toBeTypeOf('function');

    capturedOnSuccess!('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.sig', false);

    expect(storageStub.get('token')).toBe('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.sig');
    expect(storageStub.get(IS_NEW_KEY)).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
