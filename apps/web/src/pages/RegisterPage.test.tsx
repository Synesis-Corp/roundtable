import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';

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

// ─── Mock navigate ────────────────────────────────────────────────────────────

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: () => mockNavigate };
});

// ─── Mock apiPost ─────────────────────────────────────────────────────────────

const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('../lib/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api-client')>();
  return { ...original, apiPost: mockApiPost };
});

// ─── Mock OAuth buttons (they use navigate + apiPost internally) ──────────────

vi.mock('../components/GoogleSignInButton', () => ({
  default: () => null,
}));

vi.mock('../components/GitHubSignInButton', () => ({
  default: () => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

function fillAndSubmit(email = 'new@example.com', password = 'password123') {
  fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText(/at least 8/i), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RegisterPage — onboarding flag on created', () => {
  beforeEach(() => {
    storeRef.reset();
    mockNavigate.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets IS_NEW_KEY='1' when backend returns created: true", async () => {
    mockApiPost.mockResolvedValueOnce({ token: 'tok-abc', created: true });

    renderRegisterPage();
    fillAndSubmit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(storageStub.get(IS_NEW_KEY)).toBe('1');
    expect(storageStub.get('token')).toBe('tok-abc');
  });

  it('does NOT set IS_NEW_KEY when backend returns created: false', async () => {
    mockApiPost.mockResolvedValueOnce({ token: 'tok-def', created: false });

    renderRegisterPage();
    fillAndSubmit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(storageStub.get(IS_NEW_KEY)).toBeNull();
    expect(storageStub.get('token')).toBe('tok-def');
  });
});
