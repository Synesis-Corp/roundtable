import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOAuthPopup } from './oauth-popup';
import { storage } from './storage';

/**
 * Mock the window object needed by `openOAuthPopup`. We can't use
 * `window.open` directly in jsdom without mocking, so we replace the
 * methods on a fresh stub before each test.
 */
function makePopupStub(): Window & { closed: boolean } {
  const stub = {
    closed: false,
    close: vi.fn(function close(this: { closed: boolean }) {
      this.closed = true;
    }),
  };
  return stub as unknown as Window & { closed: boolean };
}

describe('openOAuthPopup', () => {
  let popupStub: ReturnType<typeof makePopupStub>;

  beforeEach(() => {
    popupStub = makePopupStub();
    vi.spyOn(window, 'open').mockReturnValue(popupStub as unknown as Window);
    storage.remove('token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    storage.remove('token');
  });

  it('returns null and calls onError when window.open returns null (popup blocked)', () => {
    vi.spyOn(window, 'open').mockReturnValueOnce(null);
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const result = openOAuthPopup({
      url: '/api/auth/github',
      onSuccess,
      onError,
    });
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Popup was blocked/));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onSuccess with the token when receiving a valid oauth-success postMessage', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.signature';
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'oauth-success', token },
      })
    );
    // `created` is not present in this message, so it arrives as undefined.
    expect(onSuccess).toHaveBeenCalledWith(token, undefined);
    expect(onError).not.toHaveBeenCalled();
    // Popup should be closed after success.
    expect(popupStub.close).toHaveBeenCalled();
  });

  it('calls onError with the message when receiving oauth-error', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'oauth-error', error: 'GitHub account email not verified' },
      })
    );
    expect(onError).toHaveBeenCalledWith('GitHub account email not verified');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('ignores postMessage from a different origin (CSRF defense)', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.signature';
    window.dispatchEvent(
      new MessageEvent('message', {
        // forged origin
        origin: 'https://evil.example.com',
        data: { type: 'oauth-success', token },
      })
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when oauth-success carries a malformed token', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'oauth-success', token: 'not-a-jwt' },
      })
    );
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/invalid token/));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('ignores postMessage with an unknown type or no type', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'something-else', payload: 42 },
      })
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: 'just a string',
      })
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('times out and calls onError if no message arrives within the timeout', () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError, timeoutMs: 1000 });

    vi.advanceTimersByTime(1000);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/timed out/));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(popupStub.close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // ─── Phase 5.5 — created propagation through postMessage ─────────────────

  it('calls onSuccess with token AND created=true when postMessage carries created: true', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.signature';
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'oauth-success', token, created: true },
      })
    );
    expect(onSuccess).toHaveBeenCalledWith(token, true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onSuccess with token AND created=false when postMessage carries created: false', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    openOAuthPopup({ url: '/api/auth/github', onSuccess, onError });

    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzIn0.signature';
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'oauth-success', token, created: false },
      })
    );
    expect(onSuccess).toHaveBeenCalledWith(token, false);
    expect(onError).not.toHaveBeenCalled();
  });
});
