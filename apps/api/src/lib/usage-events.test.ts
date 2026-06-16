import { describe, expect, it } from 'vitest';
import { toUsageEventData } from './usage-events';

describe('toUsageEventData', () => {
  it('preserves real provider response metadata for a council call', () => {
    expect(
      toUsageEventData('user-1', 'council', {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 120,
        outputTokens: 80,
        latencyMs: 450,
      })
    ).toEqual({
      userId: 'user-1',
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet',
      inputTokens: 120,
      outputTokens: 80,
      latencyMs: 450,
      mode: 'council',
    });
  });

  it('uses zero only when a provider omits token counts', () => {
    expect(
      toUsageEventData('user-2', 'single', {
        provider: 'openai',
        model: 'gpt-4o',
      })
    ).toEqual({
      userId: 'user-2',
      providerId: 'openai',
      modelId: 'gpt-4o',
      inputTokens: 0,
      outputTokens: 0,
      mode: 'single',
    });
  });
});
