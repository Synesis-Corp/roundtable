import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  OpenAICompatibleProvider,
} from '../src/index';

// Mock AI SDK packages so tests run without real network calls or API keys.
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => (model: string) => ({ model }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => (model: string) => ({ model }),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ model }),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: () => (model: string) => ({ model }),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(async ({ model }: { model: { model: string } }) => ({
    text: `response-from-${model.model}`,
    usage: { totalTokens: 42 },
  })),
  streamText: vi.fn(async ({ model: _model }: { model: { model: string } }) => ({
    fullStream: (async function* () {
      yield { type: 'reasoning', textDelta: 'thinking' };
      yield { type: 'text-delta', textDelta: 'Hello' };
      yield { type: 'text-delta', textDelta: ' world' };
    })(),
    usage: Promise.resolve({ promptTokens: 1, completionTokens: 2, totalTokens: 3 }),
  })),
  generateObject: vi.fn(async ({ model }: { model: { model: string } }) => ({
    object: { picked: model.model },
    usage: { totalTokens: 42 },
  })),
}));

describe('providers', () => {
  it('OpenAI returns capabilities', () => {
    const p = new OpenAIProvider();
    const caps = p.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].provider).toBe('openai');
  });

  it('Anthropic returns capabilities', () => {
    const p = new AnthropicProvider();
    const caps = p.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].provider).toBe('anthropic');
  });

  it('Google returns capabilities', () => {
    const p = new GoogleProvider();
    const caps = p.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].provider).toBe('google');
  });

  it('OpenAICompatible returns capabilities', () => {
    const p = new OpenAICompatibleProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseURL: 'https://openrouter.ai/api/v1',
      capabilities: [
        {
          modelId: 'openrouter-model',
          provider: 'openrouter',
          modalities: ['text'],
          features: ['tool-use'],
        },
      ],
    });
    const caps = p.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].provider).toBe('openrouter');
  });

  it('OpenAI chat returns a response', async () => {
    const p = new OpenAIProvider();
    const res = await p.chat(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4o',
      },
      'test-key'
    );
    expect(res.content).toBe('response-from-gpt-4o');
    expect(res.provider).toBe('openai');
    expect(res.tokensUsed).toBe(42);
  });

  it('Anthropic chat returns a response', async () => {
    const p = new AnthropicProvider();
    const res = await p.chat(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'claude-3-5-sonnet-20241022',
      },
      'test-key'
    );
    expect(res.content).toBe('response-from-claude-3-5-sonnet-20241022');
    expect(res.provider).toBe('anthropic');
  });

  it('Google chat returns a response', async () => {
    const p = new GoogleProvider();
    const res = await p.chat(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gemini-1.5-pro',
      },
      'test-key'
    );
    expect(res.content).toBe('response-from-gemini-1.5-pro');
    expect(res.provider).toBe('google');
  });

  it('OpenAICompatible chat returns a response', async () => {
    const p = new OpenAICompatibleProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      baseURL: 'https://openrouter.ai/api/v1',
      capabilities: [
        {
          modelId: 'openrouter-model',
          provider: 'openrouter',
          modalities: ['text'],
          features: ['tool-use'],
        },
      ],
    });
    const res = await p.chat(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openrouter-model',
      },
      'test-key'
    );
    expect(res.content).toBe('response-from-openrouter-model');
    expect(res.provider).toBe('openrouter');
  });

  it('OpenAI stream yields reasoning then tokens', async () => {
    const p = new OpenAIProvider();
    const chunks: { token: string; reasoning?: string; isFinished: boolean }[] = [];
    for await (const chunk of p.streamChat(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'gpt-4o',
      },
      'test-key'
    )) {
      chunks.push({ token: chunk.token, reasoning: chunk.reasoning, isFinished: chunk.isFinished });
    }
    expect(chunks).toHaveLength(4);
    // Reasoning deltas arrive first, with an empty token
    expect(chunks[0].reasoning).toBe('thinking');
    expect(chunks[0].token).toBe('');
    expect(chunks[1].token).toBe('Hello');
    expect(chunks[2].token).toBe(' world');
    expect(chunks[3].isFinished).toBe(true);
  });

  it('chatStructured returns the validated object and maps usage', async () => {
    const schema = z.object({ picked: z.string() });
    const p = new OpenAIProvider();
    const res = await p.chatStructured(
      { messages: [{ role: 'user', content: 'pick' }], model: 'gpt-4o' },
      schema,
      'test-key'
    );
    expect(res.object).toEqual({ picked: 'gpt-4o' });
    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-4o');
    expect(res.tokensUsed).toBe(42);
  });

  it('chatStructured works across every provider implementation', async () => {
    const schema = z.object({ picked: z.string() });
    const providers = [
      new AnthropicProvider(),
      new GoogleProvider(),
      new OpenAICompatibleProvider({
        id: 'deepseek',
        name: 'DeepSeek',
        baseURL: 'https://x',
        capabilities: [],
      }),
    ];
    for (const p of providers) {
      const res = await p.chatStructured(
        { messages: [{ role: 'user', content: 'pick' }], model: 'm' },
        schema,
        'test-key'
      );
      expect(res.object).toEqual({ picked: 'm' });
    }
  });
});
