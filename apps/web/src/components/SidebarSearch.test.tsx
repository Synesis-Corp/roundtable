import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SidebarSearch } from './SidebarSearch';
import { SHORTCUT_SEARCH_EVENT } from './KeyboardShortcutsController';

describe('SidebarSearch', () => {
  it('renders a plain button that dispatches the global search event', () => {
    const onSearch = vi.fn();
    window.addEventListener(SHORTCUT_SEARCH_EVENT, onSearch);

    render(<SidebarSearch />);
    const button = screen.getByRole('button', { name: /search conversations/i });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.click(button);

    expect(onSearch).toHaveBeenCalledTimes(1);
    window.removeEventListener(SHORTCUT_SEARCH_EVENT, onSearch);
  });
});
