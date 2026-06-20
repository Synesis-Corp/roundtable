import { describe, it, expect, vi } from 'vitest';
import { renderErrorMessage } from './renderErrorMessage';
import type { ChatStreamError } from './useSSE';
import type { TFunction } from 'i18next';

/** Build a minimal `t` mock that records the key + args, then returns a
 *  deterministic marker so the assertion can read both the routed key and
 *  the interpolated values. */
function makeT(): TFunction {
  const t = vi.fn((key: string, args?: Record<string, unknown>): string => {
    if (!args) return `[${key}]`;
    const parts = Object.entries(args).map(([k, v]) => `${k}=${String(v)}`);
    return `[${key}|${parts.join(',')}]`;
  }) as unknown as TFunction;
  return t;
}

function makeError(overrides: Partial<ChatStreamError> = {}): ChatStreamError {
  return Object.assign(new Error('raw provider message'), overrides) as ChatStreamError;
}

describe('renderErrorMessage (auto-fallback rate-limit/quota i18n routing)', () => {
  it('returns the rateLimitExceeded key for multi-provider quota errors (attemptsTried > 1)', () => {
    const t = makeT();
    const err = makeError({ kind: 'quota', provider: 'Google', attemptsTried: 4 });
    const out = renderErrorMessage(err, t);
    expect(t).toHaveBeenCalledWith('chat.errors.rateLimitExceeded', {
      count: 4,
      provider: 'Google',
    });
    expect(out).toBe('[chat.errors.rateLimitExceeded|count=4,provider=Google]');
  });

  it('returns the allCandidatesExhausted key for single-provider quota errors (attemptsTried === 1)', () => {
    const t = makeT();
    const err = makeError({ kind: 'quota', provider: 'OpenAI', attemptsTried: 1 });
    const out = renderErrorMessage(err, t);
    expect(t).toHaveBeenCalledWith('chat.errors.allCandidatesExhausted', {
      provider: 'OpenAI',
    });
    expect(out).toBe('[chat.errors.allCandidatesExhausted|provider=OpenAI]');
  });

  it('treats kind "rate-limit" the same as "quota"', () => {
    const t = makeT();
    const err = makeError({ kind: 'rate-limit', provider: 'Anthropic', attemptsTried: 2 });
    renderErrorMessage(err, t);
    expect(t).toHaveBeenCalledWith('chat.errors.rateLimitExceeded', {
      count: 2,
      provider: 'Anthropic',
    });
  });

  it('falls back to "provider" placeholder when errorProvider is missing', () => {
    const t = makeT();
    const err = makeError({ kind: 'quota', attemptsTried: 3 });
    const out = renderErrorMessage(err, t);
    expect(t).toHaveBeenCalledWith('chat.errors.rateLimitExceeded', {
      count: 3,
      provider: 'provider',
    });
    expect(out).toContain('provider=provider');
  });

  it('falls back to count=1 when attemptsTried is missing (defensive default)', () => {
    const t = makeT();
    const err = makeError({ kind: 'quota', provider: 'Google' });
    renderErrorMessage(err, t);
    expect(t).toHaveBeenCalledWith('chat.errors.allCandidatesExhausted', {
      provider: 'Google',
    });
  });

  it('falls back to the legacy "Error: ${message}" literal for non-quota errors', () => {
    const t = makeT();
    const err = makeError({ kind: 'other', message: 'Provider returned 500' });
    const out = renderErrorMessage(err, t);
    expect(t).not.toHaveBeenCalled();
    expect(out).toBe('Error: Provider returned 500');
  });

  it('falls back to the legacy literal when kind is missing entirely', () => {
    const t = makeT();
    const err = makeError({ message: 'Something went wrong' });
    const out = renderErrorMessage(err, t);
    expect(t).not.toHaveBeenCalled();
    expect(out).toBe('Error: Something went wrong');
  });

  it('falls back to the legacy literal for not-found errors (not quota)', () => {
    const t = makeT();
    const err = makeError({ kind: 'not-found', message: 'phantom model' });
    const out = renderErrorMessage(err, t);
    expect(t).not.toHaveBeenCalled();
    expect(out).toBe('Error: phantom model');
  });
});
