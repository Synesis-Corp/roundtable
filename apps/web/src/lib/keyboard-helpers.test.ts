import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isMac, matchesShortcut, getShortcutLabel } from './keyboard-helpers';

describe('isMac', () => {
  const originalUA = navigator.userAgent;
  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', { value: originalUA, configurable: true });
  });

  it('returns true on Mac UA', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    expect(isMac()).toBe(true);
  });

  it('returns false on Windows UA', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });
    expect(isMac()).toBe(false);
  });

  it('returns false on Linux UA', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
    expect(isMac()).toBe(false);
  });
});

describe('matchesShortcut', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
  });

  it('matches cmd+k on Mac', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesShortcut(ev, 'k')).toBe(true);
  });

  it('does NOT match cmd+k without metaKey on Mac', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k' });
    expect(matchesShortcut(ev, 'k')).toBe(false);
  });

  it('matches ctrl+k on non-Mac', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesShortcut(ev, 'k')).toBe(true);
  });

  it('matches plain key "/" without modifier', () => {
    const ev = new KeyboardEvent('keydown', { key: '/' });
    expect(matchesShortcut(ev, '/')).toBe(true);
  });

  it('does NOT match wrong key', () => {
    const ev = new KeyboardEvent('keydown', { key: 'x', metaKey: true });
    expect(matchesShortcut(ev, 'k')).toBe(false);
  });

  it('matches case-insensitively', () => {
    const ev = new KeyboardEvent('keydown', { key: 'K', metaKey: true });
    expect(matchesShortcut(ev, 'k')).toBe(true);
  });
});

describe('getShortcutLabel', () => {
  it('returns "⌘K" on Mac for search', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    expect(getShortcutLabel('search')).toBe('⌘K');
  });

  it('returns "Ctrl K" on Windows for search', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true,
    });
    expect(getShortcutLabel('search')).toBe('Ctrl K');
  });

  it('returns "/" for composer shortcut regardless of platform', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
    expect(getShortcutLabel('composer')).toBe('/');
  });
});
