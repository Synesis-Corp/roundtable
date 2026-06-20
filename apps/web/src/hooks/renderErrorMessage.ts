/* ------------------------------------------------------------------ */
/*  renderErrorMessage — pure helper that turns a ChatStreamError     */
/*  into a localized user-facing string. Kept as a pure function so   */
/*  it can be unit-tested without React/i18next ceremony.             */
/* ------------------------------------------------------------------ */

import type { TFunction } from 'i18next';
import type { ChatStreamError } from './useSSE';

/**
 * Resolve the user-facing error message for a failed chat stream.
 *
 * The backend tags terminal errors with `kind` (one of `'quota'`,
 * `'rate-limit'`, `'not-found'`, `'other'`), `provider` (display name of
 * the last candidate the loop tried, e.g. `"Google"`), and
 * `attemptsTried` (how many candidates the loop exhausted before giving
 * up).
 *
 * Routing:
 *   - `kind in {'quota', 'rate-limit'}` and `attemptsTried > 1` →
 *     `chat.errors.rateLimitExceeded` (multi-provider exhaustion, with
 *     `{{count}}` and `{{provider}}` interpolated).
 *   - `kind in {'quota', 'rate-limit'}` and `attemptsTried === 1` →
 *     `chat.errors.allCandidatesExhausted` (single-provider quota, with
 *     `{{provider}}` interpolated).
 *   - Anything else → legacy `Error: ${err.message}` literal.
 *
 * @param err - The error received from the SSE error envelope.
 * @param t - i18next translation function (typed as `TFunction` so the
 *   helper is testable in isolation).
 * @returns The localized user-facing error string.
 */
export function renderErrorMessage(err: ChatStreamError, t: TFunction): string {
  const isQuota = err.kind === 'quota' || err.kind === 'rate-limit';
  if (isQuota) {
    const provider = err.provider ?? 'provider';
    if ((err.attemptsTried ?? 1) > 1) {
      return t('chat.errors.rateLimitExceeded', {
        count: err.attemptsTried ?? 1,
        provider,
      });
    }
    return t('chat.errors.allCandidatesExhausted', { provider });
  }
  return `Error: ${err.message}`;
}
