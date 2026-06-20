import { describe, it, expect } from 'vitest';
import {
  isNoChatModelsError,
  isRateLimitOrQuotaError,
  isUpstreamModelNotFoundError,
  MAX_MODEL_RETRIES,
} from './chat';

describe('isNoChatModelsError (Post-deploy #1 defense-in-depth)', () => {
  it('matches the recognizable "No capable chat models available" error', () => {
    expect(
      isNoChatModelsError(new Error('No capable chat models available for this request'))
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(
      isNoChatModelsError(new Error('NO CAPABLE CHAT MODELS AVAILABLE FOR THIS REQUEST'))
    ).toBe(true);
    expect(
      isNoChatModelsError(new Error('no capable chat models available for this request'))
    ).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isNoChatModelsError(new Error('Some other failure'))).toBe(false);
    expect(isNoChatModelsError(new Error('Provider 500'))).toBe(false);
  });

  it('rejects non-Error inputs', () => {
    expect(isNoChatModelsError('No capable chat models available')).toBe(false);
    expect(isNoChatModelsError(null)).toBe(false);
    expect(isNoChatModelsError(undefined)).toBe(false);
    expect(isNoChatModelsError(42)).toBe(false);
  });
});

describe('isUpstreamModelNotFoundError (Post-deploy #1 v2 retry trigger)', () => {
  it('matches the OpenAI "not a chat model" message from prod (2026-06-18 bug)', () => {
    expect(
      isUpstreamModelNotFoundError(
        new Error(
          'This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?'
        )
      )
    ).toBe(true);
  });

  it('matches "model does not exist" patterns (Anthropic, Google style)', () => {
    expect(isUpstreamModelNotFoundError(new Error('model claude-99-ultra does not exist'))).toBe(
      true
    );
    expect(isUpstreamModelNotFoundError(new Error('Model gpt-99 does not exist'))).toBe(true);
  });

  it('matches "model not found" patterns', () => {
    expect(isUpstreamModelNotFoundError(new Error('Model not found: gpt-5.2-pro'))).toBe(true);
  });

  it('matches "unknown model" and "invalid model" patterns', () => {
    expect(isUpstreamModelNotFoundError(new Error('Unknown model: foo'))).toBe(true);
    expect(isUpstreamModelNotFoundError(new Error('Invalid model identifier'))).toBe(true);
  });

  it('rejects transient provider errors (500, rate limit, network)', () => {
    expect(isUpstreamModelNotFoundError(new Error('Provider returned 500'))).toBe(false);
    expect(isUpstreamModelNotFoundError(new Error('Rate limit exceeded'))).toBe(false);
    expect(isUpstreamModelNotFoundError(new Error('Network timeout'))).toBe(false);
    expect(isUpstreamModelNotFoundError(new Error('Authentication failed'))).toBe(false);
  });

  it('rejects non-Error inputs', () => {
    expect(isUpstreamModelNotFoundError('not a chat model')).toBe(false);
    expect(isUpstreamModelNotFoundError(null)).toBe(false);
    expect(isUpstreamModelNotFoundError(undefined)).toBe(false);
    expect(isUpstreamModelNotFoundError(42)).toBe(false);
    expect(isUpstreamModelNotFoundError({ message: 'not a chat model' })).toBe(false);
  });
});

describe('MAX_MODEL_RETRIES (Post-deploy #1 v2 cap)', () => {
  it('is a small finite number (3) — hard-coded to make runaway-retry logs obvious', () => {
    expect(MAX_MODEL_RETRIES).toBe(3);
  });
});

describe('isRateLimitOrQuotaError (auto-fallback rate-limit/quota trigger)', () => {
  it('matches a direct provider quota message', () => {
    expect(
      isRateLimitOrQuotaError(
        new Error('You exceeded your current quota, please check your plan and billing details.')
      )
    ).toBe(true);
  });

  it('matches the AI SDK wrapper "Failed after N attempts" with quota inside', () => {
    expect(
      isRateLimitOrQuotaError(
        new Error('Failed after 3 attempts. Last error: 429 Too Many Requests')
      )
    ).toBe(true);
  });

  it('matches Google RESOURCE_EXHAUSTED', () => {
    expect(
      isRateLimitOrQuotaError(new Error('RESOURCE_EXHAUSTED: Quota exceeded for metric: tokens'))
    ).toBe(true);
  });

  it('matches "payment required" / "Plan not active" billing-style messages', () => {
    expect(
      isRateLimitOrQuotaError(new Error('Payment required: please update your billing.'))
    ).toBe(true);
    expect(isRateLimitOrQuotaError(new Error('Plan not active: upgrade your subscription.'))).toBe(
      true
    );
  });

  it('is case-insensitive on the strong token', () => {
    expect(isRateLimitOrQuotaError(new Error('RATE LIMIT EXCEEDED'))).toBe(true);
    expect(isRateLimitOrQuotaError(new Error('rate_limit_exceeded'))).toBe(true);
    expect(isRateLimitOrQuotaError(new Error('FREE_TIER exhausted'))).toBe(true);
  });

  it('rejects incidental "rate limit" mention without a strong token', () => {
    // The strong-token requirement protects against false positives: a message
    // that just mentions "rate limit" in passing must NOT trigger the swap.
    expect(
      isRateLimitOrQuotaError(new Error('Something about rate limit but not actually rate limited'))
    ).toBe(false);
  });

  it('rejects 404 / not-a-chat-model messages (REQs 1 and 3 are distinct)', () => {
    expect(
      isRateLimitOrQuotaError(
        new Error(
          'This is not a chat model and thus not supported in the v1/chat/completions endpoint.'
        )
      )
    ).toBe(false);
  });

  it('rejects transient provider errors (5xx, timeout, auth)', () => {
    expect(isRateLimitOrQuotaError(new Error('Provider returned 500'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Bad Gateway'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Service Unavailable'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Gateway Timeout'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Network timeout'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Invalid API key'))).toBe(false);
    expect(isRateLimitOrQuotaError(new Error('Authentication failed'))).toBe(false);
  });

  it('rejects non-Error inputs', () => {
    expect(isRateLimitOrQuotaError('quota exceeded')).toBe(false);
    expect(isRateLimitOrQuotaError(null)).toBe(false);
    expect(isRateLimitOrQuotaError(undefined)).toBe(false);
    expect(isRateLimitOrQuotaError(42)).toBe(false);
    expect(isRateLimitOrQuotaError({ message: 'quota exceeded' })).toBe(false);
  });
});
