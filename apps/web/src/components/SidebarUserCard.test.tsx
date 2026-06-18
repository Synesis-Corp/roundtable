import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarUserCard } from './SidebarUserCard';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('../lib/api-client', () => ({
  apiGet: mockApiGet,
}));

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  mockApiGet.mockClear();
  // Stable layout for jsdom
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    left: 50,
    right: 200,
    bottom: 140,
    width: 150,
    height: 40,
    x: 50,
    y: 100,
    toJSON: () => ({}),
  }));
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderCard() {
  return render(
    <MemoryRouter>
      <SidebarUserCard
        userName="eliascando"
        displayName="Elias"
        onCloseMobile={vi.fn()}
        onLogout={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('SidebarUserCard', () => {
  it('renders a single avatar button (not two cards)', async () => {
    mockApiGet.mockResolvedValue({ totalUsers: 10 }); // admin
    renderCard();
    await waitFor(() => {
      expect(screen.getByTestId('user-menu-avatar')).toBeInTheDocument();
    });
  });

  it('shows admin badge when user is admin', async () => {
    mockApiGet.mockResolvedValue({ totalUsers: 10 });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });
  });

  it('hides admin badge when user is not admin', async () => {
    mockApiGet.mockRejectedValue({ status: 403 });
    renderCard();
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('opens the popover with Admin link when admin clicks the avatar', async () => {
    mockApiGet.mockResolvedValue({ totalUsers: 10 });
    renderCard();
    await waitFor(() => {
      expect(screen.getByTestId('user-menu-avatar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('user-menu-avatar'));
    expect(screen.getByText(/admin panel/i)).toBeInTheDocument();
  });

  it('opens the popover with Logout item', async () => {
    mockApiGet.mockRejectedValue({ status: 403 });
    renderCard();
    await waitFor(() => {
      expect(screen.getByTestId('user-menu-avatar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('user-menu-avatar'));
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });
});
