import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './openai';
import { MAX_TOOL_STEPS } from './constants';
import { tool } from 'ai';
import { z } from 'zod';

// Hoisted mocks so they are available when the module-level vi.mock runs.
// (Vitest hoists vi.mock calls to the top of the file, before any other
// imports — so the factory closure must reference variables that exist
// before any test code runs.)
const { streamTextMock, generateTextMock, generateObjectMock } = vi.hoisted(() => {
  const streamTextMock = vi.fn(async () => ({
    fullStream: (async function* () {
      yield { type: 'text-delta', textDelta: 'post-search answer' };
    })(),
    usage: Promise.resolve({ promptTokens: 1, completionTokens: 2, totalTokens: 3 }),
  }));
  const generateTextMock = vi.fn(async () => ({
    text: 'post-search answer',
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  }));
  const generateObjectMock = vi.fn(async () => ({
    object: { vote: 'gpt-4o', reason: 'best', improvement: 'none' },
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  }));
  return { streamTextMock, generateTextMock, generateObjectMock };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: streamTextMock,
    generateText: generateTextMock,
    generateObject: generateObjectMock,
  };
});

const stubZodSchema = z.object({ query: z.string() });

describe('OpenAIProvider — Codex fetch injection', () => {
  it('exposes the injected fetch so the AI SDK uses it for outbound requests', () => {
    const customFetch = (() => Promise.resolve(new Response())) as unknown as typeof fetch;
    const provider = new OpenAIProvider({
      id: 'openai',
      name: 'OpenAI',
      useResponsesApi: true,
      fetch: customFetch,
    });

    expect((provider as unknown as { fetchFn?: unknown }).fetchFn).toBe(customFetch);
  });

  it('does not set a custom fetch when none is provided (api-key path stays default)', () => {
    const provider = new OpenAIProvider({
      id: 'openai',
      name: 'OpenAI',
      useResponsesApi: false,
    });

    expect((provider as unknown as { fetchFn?: unknown }).fetchFn).toBeUndefined();
  });
});

describe('OpenAIProvider — header hygiene (null organization/project)', () => {
  it('accepts null organization and project without throwing', () => {
    expect(
      () =>
        new OpenAIProvider({
          id: 'openai',
          name: 'OpenAI',
          organization: null,
          project: null,
        })
    ).not.toThrow();
  });
});

describe('OpenAIProvider — multi-step tool loop (maxSteps)', () => {
  beforeEach(() => {
    streamTextMock.mockClear();
    generateTextMock.mockClear();
  });

  it('forwards maxSteps=MAX_TOOL_STEPS to streamText when tools are supplied (so the model can re-generate after a tool result)', async () => {
    const provider = new OpenAIProvider({ id: 'openai', name: 'OpenAI' });
    const tools = {
      web_search: tool({
        description: 'Search the web',
        parameters: stubZodSchema,
        execute: async () => ({ results: [] }),
      }),
    };

    for await (const _chunk of provider.streamChat(
      { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-5.4' },
      'sk-test',
      undefined,
      tools
    )) {
      // drain
    }

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    // Force-cast through unknown: tsc strict types vi.fn mocks with `[]`
    // tuple and refuses `mock.calls[0]?.[0]` even after toHaveBeenCalledTimes(1).
    const callArgs = (streamTextMock.mock.calls as unknown[][])[0]?.[0] as {
      maxSteps?: number;
      tools?: unknown;
    };
    expect(callArgs?.maxSteps).toBe(MAX_TOOL_STEPS);
    expect(callArgs?.tools).toBeDefined();
  });

  it('forwards maxSteps=MAX_TOOL_STEPS to generateText when tools are supplied (Council / non-streaming path)', async () => {
    const provider = new OpenAIProvider({ id: 'openai', name: 'OpenAI' });
    const tools = {
      web_search: tool({
        description: 'Search the web',
        parameters: stubZodSchema,
        execute: async () => ({ results: [] }),
      }),
    };

    await provider.chat(
      { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-5.4' },
      'sk-test',
      undefined,
      tools
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const callArgs = (generateTextMock.mock.calls as unknown[][])[0]?.[0] as {
      maxSteps?: number;
      tools?: unknown;
    };
    expect(callArgs?.maxSteps).toBe(MAX_TOOL_STEPS);
    expect(callArgs?.tools).toBeDefined();
  });
});

describe('OpenAIProvider — stream error propagation', () => {
  beforeEach(() => {
    streamTextMock.mockClear();
  });

  it('throws when fullStream emits an error part (so the route can surface it instead of hanging)', async () => {
    streamTextMock.mockResolvedValueOnce({
      fullStream: (async function* () {
        yield { type: 'error', error: new Error('provider returned 400') };
      })(),
      usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    } as never);

    const provider = new OpenAIProvider({ id: 'openai', name: 'OpenAI' });
    const drain = async () => {
      for await (const _chunk of provider.streamChat(
        { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' },
        'sk-test'
      )) {
        // drain
      }
    };

    await expect(drain()).rejects.toThrow('provider returned 400');
  });
});
