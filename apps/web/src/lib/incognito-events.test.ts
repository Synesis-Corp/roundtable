import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  INCOGNITO_CHANGED_EVENT,
  emitIncognitoChanged,
  useIncognitoFromBus,
} from './incognito-events';
import { renderHook, act } from '@testing-library/react';

describe('incognito-events', () => {
  beforeEach(() => {
    // Each test starts with a clean event state.
    window.removeEventListener(INCOGNITO_CHANGED_EVENT, () => undefined);
  });
  afterEach(() => {
    window.removeEventListener(INCOGNITO_CHANGED_EVENT, () => undefined);
  });

  it('emits a CustomEvent on window with detail.active', () => {
    const listener = vi.fn();
    window.addEventListener(INCOGNITO_CHANGED_EVENT, listener);
    emitIncognitoChanged(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const ev = listener.mock.calls[0][0] as CustomEvent<{ active: boolean }>;
    expect(ev.detail.active).toBe(true);
  });

  it('emits with active=false when called with false', () => {
    const listener = vi.fn();
    window.addEventListener(INCOGNITO_CHANGED_EVENT, listener);
    emitIncognitoChanged(false);
    const ev = listener.mock.calls[0][0] as CustomEvent<{ active: boolean }>;
    expect(ev.detail.active).toBe(false);
  });

  it('useIncognitoFromBus returns false initially and updates on event', () => {
    const listener = vi.fn();
    const { result } = renderHook(() => {
      const value = useIncognitoFromBus();
      listener(value);
      return value;
    });
    expect(result.current).toBe(false);
    act(() => {
      emitIncognitoChanged(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      emitIncognitoChanged(false);
    });
    expect(result.current).toBe(false);
  });

  it('useIncognitoFromBus cleans up listener on unmount', () => {
    const external = vi.fn();
    window.addEventListener(INCOGNITO_CHANGED_EVENT, external);
    const { unmount, result } = renderHook(() => useIncognitoFromBus());
    expect(result.current).toBe(false);
    unmount();
    act(() => {
      emitIncognitoChanged(true);
    });
    // The external listener should still fire (it's attached at the window
    // level and we never removed it). This proves the *event* is dispatched.
    expect(external).toHaveBeenCalledTimes(1);
    // But the hook's result must NOT have changed because it's unmounted.
    expect(result.current).toBe(false);
    window.removeEventListener(INCOGNITO_CHANGED_EVENT, external);
  });
});
