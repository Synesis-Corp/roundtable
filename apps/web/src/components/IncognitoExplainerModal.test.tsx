import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { IncognitoExplainerModal } from './IncognitoExplainerModal';

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  // restore body overflow after each test
  document.body.style.overflow = '';
});

describe('IncognitoExplainerModal (Capability 2)', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<IncognitoExplainerModal open={false} onClose={vi.fn()} />);
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('opens a <dialog> element with the title and 4 paragraphs', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog?.hasAttribute('open')).toBe(true);
    // Title is in an h2 inside the dialog
    expect(screen.getByText(/about incognito mode/i)).toBeInTheDocument();
    // 3 explanatory paragraphs (p1, p2, p3) + 1 recording paragraph =
    // at least 4 <p> inside the dialog. The component may add a wrapper
    // <p> for the "we do not use this data..." line, giving 4 minimum.
    const ps = dialog!.querySelectorAll('p');
    expect(ps.length).toBeGreaterThanOrEqual(4);
  });

  it('has a close button labelled "Close"', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });

  it('clicking the close button calls onClose', () => {
    const onClose = vi.fn();
    render(<IncognitoExplainerModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc keydown calls onClose', () => {
    const onClose = vi.fn();
    render(<IncognitoExplainerModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('locks body scroll on open and restores on close', async () => {
    document.body.style.overflow = '';
    const { rerender } = render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<IncognitoExplainerModal open={false} onClose={vi.fn()} />);
    // Wait for the useLayoutEffect cleanup to run after the rerender.
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('prefers-reduced-motion: transition-duration is 0s', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog')!;
    // The transition is applied to the dialog content inner div.
    // Reduced motion forces a 0s duration.
    const inner = dialog.querySelector('div')!;
    const t = inner.style.transition || '';
    // Acceptable forms: 0s, transform 0s, etc.
    expect(t).toMatch(/0s/);
  });

  it('backdrop click on the dialog (outside the content rect) closes the modal', () => {
    const onClose = vi.fn();
    render(<IncognitoExplainerModal open={true} onClose={onClose} />);
    // jsdom doesn't compute layout, so a "click outside content" needs a
    // direct dialog click — the implementation must treat the dialog
    // itself (not its children) as the backdrop. We dispatch a click on
    // the dialog element directly.
    const dialog = document.querySelector('dialog')!;
    // The component wires a click handler that calls onClose when the
    // click target IS the dialog (i.e. clicked on the backdrop, not a child).
    // jsdom won't propagate target === dialog if we fireEvent.click on a
    // child; so simulate by dispatching a click with target = dialog.
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: dialog });
    dialog.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalled();
  });

  it('click INSIDE the dialog content does NOT close', () => {
    const onClose = vi.fn();
    render(<IncognitoExplainerModal open={true} onClose={onClose} />);
    const dialog = document.querySelector('dialog')!;
    const para = dialog.querySelector('p')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: para });
    dialog.dispatchEvent(ev);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('IncognitoExplainerModal — focus trap (REQ-MODAL-5)', () => {
  // The dialog has two focusable buttons: the X (top, closeBtnRef) and the
  // bottom "Close" button. Tab from the last must wrap to the first;
  // Shift+Tab from the first must wrap to the last. Anything else is the
  // browser's job — the handler must NOT preventDefault in those cases.

  it('Tab from last focusable element wraps to first', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog')!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab from first focusable element wraps to last', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog')!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Tab from first focusable does NOT preventDefault (browser handles forward nav)', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog')!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
    const first = buttons[0];
    first.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Shift+Tab from last focusable does NOT preventDefault (browser handles backward nav)', () => {
    render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    const dialog = document.querySelector('dialog')!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
    const last = buttons[buttons.length - 1];
    last.focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('focus trap is only active while dialog is open', () => {
    const { rerender } = render(<IncognitoExplainerModal open={true} onClose={vi.fn()} />);
    rerender(<IncognitoExplainerModal open={false} onClose={vi.fn()} />);
    // When closed, dialog is unmounted; the Tab listener should be gone too.
    expect(document.querySelector('dialog')).toBeNull();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
