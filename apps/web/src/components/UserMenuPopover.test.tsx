import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserMenuPopover } from './UserMenuPopover';

function renderPopover(props: Partial<React.ComponentProps<typeof UserMenuPopover>>) {
  return render(
    <MemoryRouter>
      <UserMenuPopover
        isAdmin={false}
        displayName="Elias"
        userName="eliascando"
        onLogout={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  // Anchor the popover so getBoundingClientRect works in jsdom.
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
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
});

describe('UserMenuPopover (Capability 4)', () => {
  it('is non-modal: NO fixed backdrop, NO modal <dialog>', () => {
    renderPopover({});
    const popover = screen.getByRole('menu');
    expect(popover.tagName).toBe('DIV'); // not a modal <dialog>
    const backdrops = document.querySelectorAll('[style*="position: fixed"][style*="inset: 0"]');
    expect(backdrops.length).toBe(0);
  });

  it('renders Settings and Logout for non-admin users', () => {
    renderPopover({});
    const popover = screen.getByRole('menu');
    expect(within(popover).getByText(/settings/i)).toBeInTheDocument();
    expect(within(popover).getByText(/log out/i)).toBeInTheDocument();
  });

  it('hides the Admin link for non-admin users', () => {
    renderPopover({});
    const popover = screen.getByRole('menu');
    expect(within(popover).queryByText(/admin panel/i)).not.toBeInTheDocument();
  });

  it('shows the Admin link for admin users', () => {
    renderPopover({ isAdmin: true });
    const popover = screen.getByRole('menu');
    expect(within(popover).getByText(/admin panel/i)).toBeInTheDocument();
  });

  it('clicking the Logout item calls onLogout', () => {
    const onLogout = vi.fn();
    renderPopover({ onLogout });
    fireEvent.click(screen.getByText(/log out/i));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('logout item uses --m-rose color', () => {
    renderPopover({});
    const logout = screen.getByText(/log out/i).closest('[role="menuitem"]')!;
    expect((logout as HTMLElement).style.color).toBe('var(--m-rose)');
  });

  it('arrow-down moves focus to the next item', () => {
    renderPopover({});
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
  });

  it('arrow-up moves focus to the previous item', () => {
    renderPopover({});
    const items = screen.getAllByRole('menuitem');
    items[1].focus();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('Home jumps to first item', () => {
    renderPopover({});
    const items = screen.getAllByRole('menuitem');
    items[items.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('End jumps to last item', () => {
    renderPopover({});
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    fireEvent.keyDown(document, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('Esc closes the popover via onClose', () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('outside click closes the popover', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <div data-testid="outside">outside</div>
        <UserMenuPopover
          isAdmin={false}
          displayName="Elias"
          userName="eliascando"
          onLogout={vi.fn()}
          onClose={onClose}
        />
      </MemoryRouter>
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });
});
