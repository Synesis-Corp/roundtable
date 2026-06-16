import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarUserCard } from './SidebarUserCard';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('../lib/api-client', () => ({
  apiGet: mockApiGet,
}));

describe('SidebarUserCard', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    mockApiGet.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows admin link when user is admin', async () => {
    mockApiGet.mockResolvedValue({ totalUsers: 10 });

    render(
      <MemoryRouter>
        <SidebarUserCard
          userName="Admin"
          conversationCount={5}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });
  });

  it('hides admin link when user is not admin', async () => {
    mockApiGet.mockRejectedValue({ status: 403 });

    render(
      <MemoryRouter>
        <SidebarUserCard
          userName="User"
          conversationCount={1}
          onCloseMobile={vi.fn()}
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});
