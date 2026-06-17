import { storage } from './storage';
import i18n from '../i18n';

/**
 * Payload posted from the OAuth callback popup to its opener (the page that
 * opened the popup). `token` is the app JWT for `oauth-success`; `error` is a
 * human-readable message for `oauth-error`. The popup script in
 * `apps/api/src/routes/auth.ts#oauthCallbackHtml` serializes this exact shape.
 */
export type OAuthMessage =
  | { type: 'oauth-success'; token: string; created?: boolean }
  | { type: 'oauth-error'; error: string };

export interface OpenOAuthPopupOptions {
  /** Backend route that initiates the OAuth flow (e.g. "/api/auth/github"). */
  url: string;
  /** Window name; reused across calls so the user doesn't get duplicates. */
  popupName?: string;
  /** Window features string passed to `window.open`. */
  features?: string;
  /** Max time to wait for the popup's postMessage before giving up. Default 5 min. */
  timeoutMs?: number;
  /** Called with the app JWT and optional `created` flag on success. */
  onSuccess: (token: string, created?: boolean) => void;
  /** Called with a human-readable error message on failure. */
  onError: (message: string) => void;
}

/**
 * Opens a popup to the given URL and listens for an `OAuthMessage` posted
 * back from the popup (via the `window.opener.postMessage` call inside
 * `oauthCallbackHtml`). Closes the popup on success or error.
 *
 * The origin check is `event.origin === window.location.origin` — the message
 * comes from a page WE served (the callback HTML), not from github.com. This
 * prevents a malicious site (if it somehow opened us) from spoofing the
 * message. Same-origin in production is `https://app.com`; in dev it's
 * `http://localhost:3000` or `http://localhost`.
 *
 * Storage is also used: if the postMessage handler is racy with the popup
 * closing, we can persist the token across reloads. (Currently unused but
 * documents the contract.)
 */
export function openOAuthPopup(opts: OpenOAuthPopupOptions): Window | null {
  const popupName = opts.popupName ?? 'oauth-popup';
  const features = opts.features ?? 'width=600,height=700,scrollbars=yes,resizable=yes';
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  const popup = window.open(opts.url, popupName, features);
  if (!popup) {
    opts.onError(i18n.t('auth.errors.popupBlocked'));
    return null;
  }

  // Track the origin we expect the message to come from. `window.location.origin`
  // is the SPA's own origin — the callback HTML is served by the same origin
  // (via nginx proxy), so its `postMessage` carries that same origin.
  const expectedOrigin = window.location.origin;

  const cleanup = () => {
    window.removeEventListener('message', listener);
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
    if (!popup.closed) popup.close();
  };

  const listener = (event: MessageEvent<unknown>) => {
    if (event.origin !== expectedOrigin) return; // ignore messages from other origins
    const data = event.data as OAuthMessage | undefined;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (data.type === 'oauth-success') {
      if (typeof data.token !== 'string' || data.token.length === 0) {
        cleanup();
        opts.onError(i18n.t('auth.errors.oauthNoToken'));
        return;
      }
      // Defense in depth: the message comes from our own origin, but the
      // token still needs to look like a JWT (3 base64url segments).
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token)) {
        cleanup();
        opts.onError(i18n.t('auth.errors.oauthInvalidToken'));
        return;
      }
      cleanup();
      // Suppress the unused-storage warning — we keep storage imported so the
      // contract is obvious to future readers (caller may persist the token
      // themselves; we just hand it back).
      void storage;
      opts.onSuccess(data.token, data.created);
    } else if (data.type === 'oauth-error') {
      cleanup();
      opts.onError(data.error || i18n.t('auth.errors.oauthFailed'));
    }
  };

  window.addEventListener('message', listener);

  // Timeout: the user walked away. Close the popup and fail the flow.
  const timeoutHandle = window.setTimeout(() => {
    cleanup();
    opts.onError(i18n.t('auth.errors.oauthTimeout'));
  }, timeoutMs);

  return popup;
}
