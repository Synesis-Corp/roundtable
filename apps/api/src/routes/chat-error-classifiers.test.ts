import { describe, it, expect } from 'vitest';
import { isNoChatModelsError, isUpstreamModelNotFoundError, MAX_MODEL_RETRIES } from './chat';

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
