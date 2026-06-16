import { describe, expect, it, vi } from 'vitest';
import type { ProviderPlugin, StructuredResponse } from '@chat/sdk';
import {
  extractMemoriesFromExchange,
  persistExtractedMemories,
  type ExtractedMemories,
  type ExtractMemoriesInput,
} from './memory-extractor';
import type { MemoryRepository } from './memory';

function plugin(
  structured: StructuredResponse<ExtractedMemories> | Error,
  text?: string
): ProviderPlugin {
  return {
    id: 'mock',
    name: 'Mock',
    getCapabilities: vi.fn(),
    chat: vi.fn().mockImplementation(async () => {
      if (text === undefined) {
        return { content: JSON.stringify({ memories: [] }), provider: 'mock', model: 'm' };
      }
      return { content: text, provider: 'mock', model: 'm' };
    }),
    streamChat: vi.fn(),
    chatStructured: vi.fn().mockImplementation(async () => {
      if (structured instanceof Error) throw structured;
      return structured;
    }),
  } as unknown as ProviderPlugin;
}

function input(overrides: Partial<ExtractMemoriesInput> = {}): ExtractMemoriesInput {
  return {
    provider: plugin({ object: { memories: [] }, provider: 'mock', model: 'm' }),
    modelId: 'm',
    apiKey: 'key',
    userId: 'u1',
    messages: [
      { role: 'user', content: 'Estoy construyendo Roundtable' },
      { role: 'assistant', content: 'Suena interesante.' },
    ],
    ...overrides,
  };
}

describe('extractMemoriesFromExchange', () => {
  it('returns structured memories when the provider supports structured output', async () => {
    const response: StructuredResponse<ExtractedMemories> = {
      object: { memories: ['Trabaja en el proyecto Roundtable'] },
      provider: 'mock',
      model: 'm',
    };
    const result = await extractMemoriesFromExchange(input({ provider: plugin(response) }));
    expect(result.memories).toEqual(['Trabaja en el proyecto Roundtable']);
  });

  it('falls back to text parsing when structured output fails', async () => {
    const provider = plugin(new Error('unsupported'), '{"memories": ["Prefiere café"]}');
    const result = await extractMemoriesFromExchange(input({ provider }));
    expect(result.memories).toEqual(['Prefiere café']);
  });

  it('returns empty memories when both structured and text parsing fail', async () => {
    const provider = plugin(new Error('unsupported'), 'no json here');
    const result = await extractMemoriesFromExchange(input({ provider }));
    expect(result.memories).toEqual([]);
  });

  it('strips markdown fences from text responses', async () => {
    const provider = plugin(
      new Error('unsupported'),
      '```json\n{"memories": ["Le gusta TypeScript"]}\n```'
    );
    const result = await extractMemoriesFromExchange(input({ provider }));
    expect(result.memories).toEqual(['Le gusta TypeScript']);
  });

  it('skips extraction (no provider call) when the model is excluded from memory-extraction', async () => {
    const provider = plugin({ object: { memories: ['nope'] }, provider: 'openai', model: 'x' });
    (provider as unknown as { id: string }).id = 'openai';
    const result = await extractMemoriesFromExchange(
      input({ provider, modelId: 'text-embedding-3-small' })
    );
    expect(result.memories).toEqual([]);
    expect(provider.chatStructured).not.toHaveBeenCalled();
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('returns empty memories when there is no user message', async () => {
    const result = await extractMemoriesFromExchange(
      input({ messages: [{ role: 'assistant', content: 'Hola' }] })
    );
    expect(result.memories).toEqual([]);
  });

  it('truncates long messages to keep the prompt bounded', async () => {
    const longContent = 'a'.repeat(5_000);
    const provider = plugin({
      object: { memories: ['Mensaje largo recibido'] },
      provider: 'mock',
      model: 'm',
    });
    const result = await extractMemoriesFromExchange(
      input({
        provider,
        messages: [
          { role: 'user', content: longContent },
          { role: 'assistant', content: 'ok' },
        ],
      })
    );
    expect(result.memories).toEqual(['Mensaje largo recibido']);
  });
});

describe('persistExtractedMemories', () => {
  it('stores each memory and logs the count', async () => {
    const created: Array<{ content: string }> = [];
    const repository: MemoryRepository = {
      findDedupCandidates: vi.fn(async () => []),
      findRecallCandidates: vi.fn(),
      create: vi.fn(async ({ content }) => {
        const record = {
          id: 'm' + created.length,
          content,
          source: null,
          tags: [],
          userId: 'u1',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        created.push(record);
        return record;
      }),
    };
    const logger = { warn: vi.fn(), info: vi.fn() };

    await persistExtractedMemories({
      repository,
      userId: 'u1',
      conversationId: 'c1',
      memories: ['A', 'B'],
      logger,
    });

    expect(created.map((m) => m.content)).toEqual(['A', 'B']);
    expect(logger.info).toHaveBeenCalledWith({ userId: 'u1', count: 2 }, 'memories extracted');
  });

  it('continues when a duplicate is detected', async () => {
    const repository: MemoryRepository = {
      findDedupCandidates: vi.fn(async () => []),
      findRecallCandidates: vi.fn(),
      create: vi.fn().mockRejectedValueOnce(new Error('duplicate')),
    };
    const logger = { warn: vi.fn(), info: vi.fn() };

    await persistExtractedMemories({
      repository,
      userId: 'u1',
      memories: ['A'],
      logger,
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ userId: 'u1', count: 0 }, 'memories extracted');
  });

  it('logs real persistence errors but does not throw', async () => {
    const repository: MemoryRepository = {
      findDedupCandidates: vi.fn(async () => []),
      findRecallCandidates: vi.fn(),
      create: vi.fn().mockRejectedValueOnce(new Error('db down')),
    };
    const logger = { warn: vi.fn(), info: vi.fn() };

    await persistExtractedMemories({
      repository,
      userId: 'u1',
      memories: ['A'],
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'memory extraction: persist failed'
    );
  });
});
