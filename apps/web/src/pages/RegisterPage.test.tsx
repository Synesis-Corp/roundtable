import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// ─── Mock LanguageSwitcher ────────────────────────────────────────────────────

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => null,
}));

// ─── Auth-ui visual polish tests ──────────────────────────────────────────────

function renderRegisterPage2() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe('RegisterPage — auth-ui visual polish', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── T2: Capability 2 — Focus ring ──────────────────────────────────────────

  describe('Cap 2 — Focus ring (input-dark on all inputs)', () => {
    it('2.3 all 3 inputs have input-dark class', () => {
      renderRegisterPage2();
      const inputs = document.querySelectorAll('input');
      expect(inputs).toHaveLength(3);
      inputs.forEach((input) => {
        expect(input.className).toContain('input-dark');
      });
    });
  });

  // ── T4: Capability 4 — Serif title ─────────────────────────────────────────

  describe('Cap 4 — Serif title', () => {
    it('4.4 h1 has font-serif class', () => {
      renderRegisterPage2();
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).toContain('font-serif');
    });

    it('4.5 h1 displays the register title text', () => {
      renderRegisterPage2();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create account');
    });
  });

  // ── T5: Capability 5 — Background dot pattern ──────────────────────────────

  describe('Cap 5 — Background dot pattern (auth-bg)', () => {
    it('5.4 renders a wrapper with data-testid="auth-bg" and auth-bg class', () => {
      renderRegisterPage2();
      const bg = screen.getByTestId('auth-bg');
      expect(bg).toBeInTheDocument();
      expect(bg.className).toContain('auth-bg');
    });
  });

  // ── T7: Capability 6 — Form spacing (RegisterPage) ─────────────────────────

  describe('Cap 6 — Compact form spacing (RegisterPage)', () => {
    it('7.1 form has the tighter space-y-4 class', () => {
      renderRegisterPage2();
      const formEl = document.querySelector('form')!;
      expect(formEl.className).toContain('space-y-4');
    });

    it('7.2 auth-header uses the tighter mb-7 class (not the tall mb-10)', () => {
      renderRegisterPage2();
      const header = screen.getByTestId('auth-header');
      expect(header.className).toContain('mb-7');
      expect(header.className).not.toContain('mb-10');
    });
  });

  // ── T8: Capability 1 — Glass card on RegisterPage ──────────────────────────

  describe('Cap 1 — Glass card (auth-card on RegisterPage)', () => {
    it('8.1 renders a wrapper with data-testid="auth-card"', () => {
      renderRegisterPage2();
      expect(screen.getByTestId('auth-card')).toBeInTheDocument();
    });

    it('8.2 auth-card has the auth-card CSS class', () => {
      renderRegisterPage2();
      const card = screen.getByTestId('auth-card');
      expect(card.className).toContain('auth-card');
    });

    it('8.3 form is inside the auth-card', () => {
      renderRegisterPage2();
      const card = screen.getByTestId('auth-card');
      const formEl = within(card).getByRole('button', { name: /create account/i });
      expect(formEl).toBeInTheDocument();
    });
  });
});

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

// ─── Cap 7: Brand accent alignment ────────────────────────────────────────────
// The sign-in link must use the brand accent (indigo) class, not Tailwind blue,
// so the auth pages align with the rest of the product.

describe('RegisterPage — Cap 7 brand accent alignment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('7.1 the sign-in link uses the auth-link accent class', () => {
    renderRegisterPage2();
    const link = screen.getByRole('link');
    expect(link.className).toContain('auth-link');
  });

  it('7.2 the sign-in link does NOT use hardcoded Tailwind blue', () => {
    renderRegisterPage2();
    const link = screen.getByRole('link');
    expect(link.className).not.toContain('text-blue-400');
    expect(link.className).not.toContain('text-blue-300');
  });
});
