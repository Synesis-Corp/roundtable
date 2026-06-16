import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// storage backs both auth guards; we drive it per-test to simulate logged
// in / out without touching real localStorage.
const mockGet = vi.hoisted(() => vi.fn());
vi.mock('./lib/storage', () => ({
  storage: { get: mockGet, set: vi.fn(), remove: vi.fn() },
}));

// Replace the real pages with markers so routing is the only thing under test
// (the pages pull in data hooks we don't care about here).
vi.mock('./components/Layout', () => ({
  default: () => <div>layout-shell</div>,
}));
vi.mock('./pages/ChatPage', () => ({ default: () => <div>chat-page</div> }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>settings-page</div> }));
vi.mock('./pages/LoginPage', () => ({ default: () => <div>login-page</div> }));
vi.mock('./pages/RegisterPage', () => ({ default: () => <div>register-page</div> }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('App routing guards', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows the login page to a logged-out user', async () => {
    mockGet.mockReturnValue(null);
    renderAt('/login');
    expect(await screen.findByText('login-page')).toBeInTheDocument();
  });

  it('redirects a logged-out user away from the app to /login', async () => {
    mockGet.mockReturnValue(null);
    renderAt('/');
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('layout-shell')).not.toBeInTheDocument();
  });

  it('redirects a logged-in user away from /login into the app', () => {
    mockGet.mockReturnValue('a-token');
    renderAt('/login');
    expect(screen.getByText('layout-shell')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });

  it('redirects a logged-in user away from /register into the app', () => {
    mockGet.mockReturnValue('a-token');
    renderAt('/register');
    expect(screen.getByText('layout-shell')).toBeInTheDocument();
    expect(screen.queryByText('register-page')).not.toBeInTheDocument();
  });
});
