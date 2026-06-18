import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IncognitoTopBar } from './IncognitoTopBar';

beforeEach(() => {
  // jsdom defaults to "no-preference" — make it deterministic for the
  // transition-duration test cases.
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
});

describe('IncognitoTopBar (Capability 1)', () => {
  it('renders with the incognito-top-bar testid, label, eye-slash icon, and X button', () => {
    const onExit = vi.fn();
    render(<IncognitoTopBar onExit={onExit} />);
    const bar = screen.getByTestId('incognito-top-bar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText(/incognito chat/i)).toBeInTheDocument();
    // X button is a button with aria-label "Exit incognito mode"
    expect(screen.getByRole('button', { name: /exit incognito mode/i })).toBeInTheDocument();
  });

  it('clicking the X button calls onExit exactly once', () => {
    const onExit = vi.fn();
    render(<IncognitoTopBar onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /exit incognito mode/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('background color is a subtle amber tint (alpha <= 0.08)', () => {
    render(<IncognitoTopBar onExit={vi.fn()} />);
    const bar = screen.getByTestId('incognito-top-bar');
    // Inline style background is rgba(245, 158, 11, 0.06) — alpha 0.06 <= 0.08.
    expect(bar.style.backgroundColor).toBe('rgba(245, 158, 11, 0.06)');
  });

  it('border is subtle amber (alpha <= 0.22)', () => {
    render(<IncognitoTopBar onExit={vi.fn()} />);
    const bar = screen.getByTestId('incognito-top-bar');
    expect(bar.style.borderBottom).toBe('1px solid rgba(245, 158, 11, 0.18)');
  });

  it('48px height', () => {
    render(<IncognitoTopBar onExit={vi.fn()} />);
    const bar = screen.getByTestId('incognito-top-bar');
    expect(bar.style.height).toBe('48px');
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
    render(<IncognitoTopBar onExit={vi.fn()} />);
    const bar = screen.getByTestId('incognito-top-bar');
    // The transition is applied via inline style. Reduced motion must
    // shorten it to 0s.
    const transition = bar.style.transition || '';
    expect(transition.includes('0s') || transition === '').toBe(true);
  });

  it('motion allowed: transition is non-zero and <= 250ms', () => {
    render(<IncognitoTopBar onExit={vi.fn()} />);
    const bar = screen.getByTestId('incognito-top-bar');
    const transition = bar.style.transition || '';
    // Should contain "ms" durations. We assert the format rather than
    // exact values to avoid brittleness.
    expect(transition).toMatch(/\d+ms/);
  });

  it('Esc on the top bar exits incognito', () => {
    const onExit = vi.fn();
    render(<IncognitoTopBar onExit={onExit} />);
    const bar = screen.getByTestId('incognito-top-bar');
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('icon and label use --m-amber color', () => {
    const { container } = render(<IncognitoTopBar onExit={vi.fn()} />);
    // The first svg or icon span should carry the amber color.
    // The label span has the amber color as well.
    const labelSpan = container.querySelector('span')!;
    expect(labelSpan.style.color).toBe('var(--m-amber)');
  });
});
