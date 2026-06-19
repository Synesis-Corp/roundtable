import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SHORTCUT_SEARCH_EVENT } from './KeyboardShortcutsController';
import { SearchOverlay } from './SearchOverlay';
import { searchConversations } from '../lib/api-client';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return {
    ...actual,
    searchConversations: vi.fn(),
  };
});

const searchMock = vi.mocked(searchConversations);

beforeEach(() => {
  vi.useFakeTimers();
  navigateMock.mockClear();
  searchMock.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function openOverlay() {
  render(<SearchOverlay />);
  act(() => {
    window.dispatchEvent(new CustomEvent(SHORTCUT_SEARCH_EVENT));
  });
}

describe('SearchOverlay', () => {
  it('opens on SHORTCUT_SEARCH_EVENT and autofocuses the search input', async () => {
    openOverlay();

    const dialog = screen.getByRole('dialog', { name: /search conversations/i });
    expect(dialog).toBeInTheDocument();

    expect(screen.getByRole('searchbox', { name: /search conversations/i })).toHaveFocus();
  });

  it('shows the empty hint without calling the API', () => {
    openOverlay();

    expect(screen.getByText(/type to search/i)).toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('debounces typing into a single API request and renders grouped snippet results safely', async () => {
    searchMock.mockResolvedValueOnce({
      results: [
        {
          id: 'conv-1',
          title: 'Roadmap',
          updatedAt: new Date().toISOString(),
          matchedIn: 'content',
          snippet: 'safe &lt;script&gt;bad&lt;/script&gt; <mark>roadmap</mark>',
        },
      ],
    });
    openOverlay();

    const input = screen.getByRole('searchbox', { name: /search conversations/i });
    fireEvent.change(input, { target: { value: 'roadmap' } });

    expect(searchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][0]).toBe('roadmap');
    expect(screen.getByText(/today/i)).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.getByText('roadmap').tagName).toBe('MARK');
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.textContent).toContain('&lt;script&gt;bad&lt;/script&gt;');
  });

  it('moves selection with arrows, Enter navigates to the highlighted conversation, and Esc closes', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    searchMock.mockResolvedValueOnce({
      results: [
        {
          id: 'conv-1',
          title: 'First',
          updatedAt: new Date().toISOString(),
          matchedIn: 'title',
          snippet: null,
        },
        {
          id: 'conv-2',
          title: 'Second',
          updatedAt: new Date().toISOString(),
          matchedIn: 'title',
          snippet: null,
        },
      ],
    });
    render(<SearchOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SHORTCUT_SEARCH_EVENT));
    });

    const input = screen.getByRole('searchbox', { name: /search conversations/i });
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(screen.getByText('Second')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(navigateMock).toHaveBeenCalledWith('/c/conv-2');
    expect(screen.queryByRole('dialog', { name: /search conversations/i })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent(SHORTCUT_SEARCH_EVENT));
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /search conversations/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps Tab focus inside the dialog while results are visible', async () => {
    searchMock.mockResolvedValueOnce({
      results: [
        {
          id: 'conv-1',
          title: 'First',
          updatedAt: new Date().toISOString(),
          matchedIn: 'title',
          snippet: null,
        },
      ],
    });
    openOverlay();

    const input = screen.getByRole('searchbox', { name: /search conversations/i });
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const result = screen.getByRole('button', { name: /first/i });
    input.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(result).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(input).toHaveFocus();
  });

  it('renders multiple date groups for results across different days', async () => {
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    searchMock.mockResolvedValueOnce({
      results: [
        {
          id: 'conv-1',
          title: 'Today result',
          updatedAt: '2026-06-18T10:00:00.000Z',
          matchedIn: 'title',
          snippet: null,
        },
        {
          id: 'conv-2',
          title: 'Week result',
          updatedAt: '2026-06-15T10:00:00.000Z',
          matchedIn: 'content',
          snippet: 'weekly <mark>result</mark>',
        },
      ],
    });
    openOverlay();

    const input = screen.getByRole('searchbox', { name: /search conversations/i });
    fireEvent.change(input, { target: { value: 'result' } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /this week/i })).toBeInTheDocument();
    expect(screen.getByText('Today result')).toBeInTheDocument();
    expect(screen.getByText('Week result')).toBeInTheDocument();
  });

  it('shows a no-results state for a settled query with zero matches', async () => {
    searchMock.mockResolvedValueOnce({ results: [] });
    openOverlay();

    const input = screen.getByRole('searchbox', { name: /search conversations/i });
    fireEvent.change(input, { target: { value: 'xylophone' } });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(screen.getByText(/no results for «xylophone»/i)).toBeInTheDocument();
  });
});
