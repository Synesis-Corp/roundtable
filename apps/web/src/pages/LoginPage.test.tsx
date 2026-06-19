import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// ─── Mock navigate ────────────────────────────────────────────────────────────

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: () => mockNavigate };
});

// ─── Mock child components that have their own deps ───────────────────────────

vi.mock('../components/GoogleSignInButton', () => ({
  default: () => null,
}));

vi.mock('../components/GitHubSignInButton', () => ({
  default: () => null,
}));

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => null,
}));

// ─── Mock apiPost ─────────────────────────────────────────────────────────────

vi.mock('../lib/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api-client')>();
  return { ...original, apiPost: vi.fn() };
});

// ─── Mock storage ─────────────────────────────────────────────────────────────

vi.mock('../lib/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/storage')>();
  return {
    ...original,
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LoginPage — auth-ui visual polish', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── T1: Capability 1 — Glass card ──────────────────────────────────────────

  describe('Cap 1 — Glass card (auth-card)', () => {
    it('1.1 renders a wrapper with data-testid="auth-card"', () => {
      renderLoginPage();
      expect(screen.getByTestId('auth-card')).toBeInTheDocument();
    });

    it('1.2 auth-card element has the auth-card CSS class', () => {
      renderLoginPage();
      const card = screen.getByTestId('auth-card');
      expect(card.className).toContain('auth-card');
    });

    it('1.3 the submit button is a descendant of the auth-card', () => {
      renderLoginPage();
      const card = screen.getByTestId('auth-card');
      const btn = within(card).getByRole('button', { name: /sign in/i });
      expect(btn).toBeInTheDocument();
    });

    it('1.4 auth-card does NOT have the bg-app class', () => {
      renderLoginPage();
      const card = screen.getByTestId('auth-card');
      expect(card.className).not.toContain('bg-app');
    });
  });

  // ── T2: Capability 2 — Focus ring ──────────────────────────────────────────

  describe('Cap 2 — Focus ring (input-dark)', () => {
    it('2.1 email input has input-dark class', () => {
      renderLoginPage();
      const emailInput = screen.getByPlaceholderText(/you@example\.com/i);
      expect(emailInput.className).toContain('input-dark');
    });

    it('2.2 password input has input-dark class', () => {
      renderLoginPage();
      const passwordInput = screen.getByPlaceholderText(/password/i);
      expect(passwordInput.className).toContain('input-dark');
    });
  });

  // ── T4: Capability 4 — Serif title ─────────────────────────────────────────

  describe('Cap 4 — Serif title', () => {
    it('4.1 h1 has font-serif class', () => {
      renderLoginPage();
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).toContain('font-serif');
    });

    it('4.2 h1 does NOT have the heading class', () => {
      renderLoginPage();
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).not.toContain('heading');
    });

    it('4.3 h1 displays the login title text', () => {
      renderLoginPage();
      // i18n is initialized with English in test setup → real string is shown
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back');
    });
  });

  // ── T5: Capability 5 — Background dot pattern ──────────────────────────────

  describe('Cap 5 — Background dot pattern (auth-bg)', () => {
    it('5.1 renders a wrapper with data-testid="auth-bg"', () => {
      renderLoginPage();
      expect(screen.getByTestId('auth-bg')).toBeInTheDocument();
    });

    it('5.2 auth-bg element has the auth-bg CSS class', () => {
      renderLoginPage();
      const bg = screen.getByTestId('auth-bg');
      expect(bg.className).toContain('auth-bg');
    });

    it('5.3 auth-bg does NOT have the old inline radial-gradient Tailwind class', () => {
      renderLoginPage();
      const bg = screen.getByTestId('auth-bg');
      expect(bg.className).not.toContain('bg-[radial-gradient');
    });
  });

  // ── T6: Capability 6 — Form spacing (LoginPage) ────────────────────────────

  describe('Cap 6 — Form spacing (LoginPage)', () => {
    it('6.1 form has space-y-5 class', () => {
      renderLoginPage();
      // The <form> has no accessible name so getByRole('form') won't work;
      // use querySelector as the spec-approved fallback.
      const formEl = document.querySelector('form')!;
      expect(formEl).toBeTruthy();
      expect(formEl.className).toContain('space-y-5');
    });

    it('6.2 form does NOT have space-y-4 class', () => {
      renderLoginPage();
      const formEl = document.querySelector('form')!;
      expect(formEl.className).not.toContain('space-y-4');
    });

    it('6.3 auth-header has mb-10 class', () => {
      renderLoginPage();
      const header = screen.getByTestId('auth-header');
      expect(header.className).toContain('mb-10');
    });

    it('6.4 auth-header does NOT have mb-8 class', () => {
      renderLoginPage();
      const header = screen.getByTestId('auth-header');
      expect(header.className).not.toContain('mb-8');
    });
  });

  // ── T7: Capability 7 — Brand accent alignment ──────────────────────────────
  // The app accent is indigo (--accent #747bed). The account-switch link must
  // use the brand accent class, NOT hardcoded Tailwind blue, so the auth pages
  // align with the rest of the product's visual language.

  describe('Cap 7 — Brand accent alignment', () => {
    it('7.1 the create-account link uses the auth-link accent class', () => {
      renderLoginPage();
      const link = screen.getByRole('link');
      expect(link.className).toContain('auth-link');
    });

    it('7.2 the create-account link does NOT use hardcoded Tailwind blue', () => {
      renderLoginPage();
      const link = screen.getByRole('link');
      expect(link.className).not.toContain('text-blue-400');
      expect(link.className).not.toContain('text-blue-300');
    });
  });
});
