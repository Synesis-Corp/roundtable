import { describe, expect, it } from 'vitest';
import {
  estimateMemoryTokens,
  normalizeMemoryContent,
  retrieveMemories,
  storeMemory,
  type CreateMemoryRecord,
  type MemoryRecord,
  type MemoryRepository,
} from './memory';

const NOW = new Date('2026-06-12T20:00:00.000Z');

function memory(
  id: string,
  userId: string,
  content: string,
  updatedAt: string,
  overrides: Partial<MemoryRecord> = {}
): MemoryRecord {
  return {
    id,
    userId,
    content,
    source: { type: 'manual' },
    tags: [],
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    ...overrides,
  };
}

class InMemoryRepository implements MemoryRepository {
  readonly records: MemoryRecord[];
  createCalls: CreateMemoryRecord[] = [];
  recallLimit?: number;

  constructor(records: MemoryRecord[] = []) {
    this.records = [...records];
  }

  async findDedupCandidates(userId: string, limit: number): Promise<readonly MemoryRecord[]> {
    return this.records.filter((record) => record.userId === userId).slice(0, limit);
  }

  async findRecallCandidates(userId: string, limit: number): Promise<readonly MemoryRecord[]> {
    this.recallLimit = limit;
    return this.records.filter((record) => record.userId === userId).slice(0, limit);
  }

  async create(input: CreateMemoryRecord): Promise<MemoryRecord> {
    this.createCalls.push(input);
    const created = memory(
      `created-${this.createCalls.length}`,
      input.userId,
      input.content,
      NOW.toISOString(),
      { source: input.source, tags: input.tags }
    );
    this.records.push(created);
    return created;
  }
}

describe('normalizeMemoryContent', () => {
  it('normalizes case, repeated whitespace, and trivial punctuation', () => {
    expect(normalizeMemoryContent('  Prefiero   MODO oscuro!!! ')).toBe('prefiero modo oscuro');
  });

  it('preserves meaningful programming-language symbols', () => {
    expect(normalizeMemoryContent('Trabajo con C++')).not.toBe(
      normalizeMemoryContent('Trabajo con C#')
    );
  });
});

describe('storeMemory', () => {
  it('stores an atomic memory with clean content and normalized unique tags', async () => {
    const repository = new InMemoryRepository();

    const result = await storeMemory(repository, {
      userId: 'user-a',
      content: '  Estoy   construyendo Roundtable.  ',
      source: { type: 'conversation', conversationId: 'conversation-1' },
      tags: [' Proyecto ', 'TypeScript', 'proyecto', ''],
    });

    expect(result.status).toBe('stored');
    expect(repository.createCalls).toEqual([
      {
        userId: 'user-a',
        content: 'Estoy construyendo Roundtable.',
        source: { type: 'conversation', conversationId: 'conversation-1' },
        tags: ['proyecto', 'typescript'],
      },
    ]);
  });

  it('does not store duplicates that differ only by case, spacing, or punctuation', async () => {
    const existing = memory(
      'memory-1',
      'user-a',
      'Prefiero respuestas directas.',
      '2026-06-10T10:00:00.000Z'
    );
    const repository = new InMemoryRepository([existing]);

    const result = await storeMemory(repository, {
      userId: 'user-a',
      content: '  prefiero   RESPUESTAS directas!!! ',
      source: { type: 'manual' },
      tags: [],
    });

    expect(result).toEqual({ status: 'duplicate', memory: existing });
    expect(repository.createCalls).toHaveLength(0);
  });

  it('isolates deduplication per user', async () => {
    const repository = new InMemoryRepository([
      memory(
        'other-user-memory',
        'user-b',
        'Prefiero respuestas directas.',
        '2026-06-10T10:00:00.000Z'
      ),
    ]);

    const result = await storeMemory(repository, {
      userId: 'user-a',
      content: 'Prefiero respuestas directas.',
      source: { type: 'manual' },
    });

    expect(result.status).toBe('stored');
    expect(repository.createCalls).toHaveLength(1);
  });

  it('rejects empty content instead of creating an unusable memory', async () => {
    const repository = new InMemoryRepository();

    await expect(
      storeMemory(repository, {
        userId: 'user-a',
        content: ' \n\t ',
        source: { type: 'manual' },
      })
    ).rejects.toThrow('Memory content cannot be empty');
    expect(repository.createCalls).toHaveLength(0);
  });
});

describe('retrieveMemories', () => {
  it('ranks keyword matches ahead of newer unrelated memories', async () => {
    const repository = new InMemoryRepository([
      memory('new-unrelated', 'user-a', 'Prefiere café sin azúcar', '2026-06-12T19:00:00.000Z'),
      memory(
        'old-related',
        'user-a',
        'Está construyendo una arquitectura TypeScript',
        '2026-05-01T10:00:00.000Z'
      ),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'arquitectura TypeScript',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['old-related', 'new-unrelated']);
  });

  it('ranks more keyword overlap above partial overlap', async () => {
    const repository = new InMemoryRepository([
      memory('partial', 'user-a', 'Trabaja con TypeScript', '2026-06-12T19:00:00.000Z'),
      memory('full', 'user-a', 'Trabaja con TypeScript y testing', '2026-06-01T10:00:00.000Z'),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript testing',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['full', 'partial']);
  });

  it('uses tags as recall keywords', async () => {
    const repository = new InMemoryRepository([
      memory('untagged', 'user-a', 'Prefiere Vitest', '2026-06-12T19:00:00.000Z'),
      memory('tagged', 'user-a', 'Usa pruebas unitarias', '2026-06-01T10:00:00.000Z', {
        tags: ['typescript'],
      }),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript',
      tokenBudget: 100,
    });

    expect(result[0]?.id).toBe('tagged');
  });

  it('uses updatedAt recency when keyword relevance ties', async () => {
    const repository = new InMemoryRepository([
      memory('older', 'user-a', 'Trabaja con TypeScript', '2026-06-01T10:00:00.000Z'),
      memory('newer', 'user-a', 'Prefiere TypeScript', '2026-06-12T10:00:00.000Z'),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['newer', 'older']);
  });

  it('falls back to recency for an empty query and breaks exact ties by id', async () => {
    const repository = new InMemoryRepository([
      memory('b', 'user-a', 'Segunda', '2026-06-12T10:00:00.000Z'),
      memory('a', 'user-a', 'Primera', '2026-06-12T10:00:00.000Z'),
      memory('older', 'user-a', 'Anterior', '2026-06-01T10:00:00.000Z'),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: '   ',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['a', 'b', 'older']);
  });

  it('keeps deterministic id ordering when repository timestamps are invalid', async () => {
    const invalidDate = new Date('invalid');
    const repository = new InMemoryRepository([
      memory('b', 'user-a', 'Segunda', NOW.toISOString(), {
        createdAt: invalidDate,
        updatedAt: invalidDate,
      }),
      memory('a', 'user-a', 'Primera', NOW.toISOString(), {
        createdAt: invalidDate,
        updatedAt: invalidDate,
      }),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['a', 'b']);
  });

  it('enforces both item and repository candidate caps defensively', async () => {
    const records = Array.from({ length: 30 }, (_, index) =>
      memory(
        `memory-${String(index).padStart(2, '0')}`,
        'user-a',
        `Dato ${index}`,
        new Date(NOW.getTime() - index * 1_000).toISOString()
      )
    );
    const repository = new InMemoryRepository(records);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      maxItems: 999,
      candidateLimit: 9999,
      tokenBudget: 10_000,
    });

    expect(result).toHaveLength(20);
    expect(repository.recallLimit).toBe(200);
  });

  it('never crosses the token budget and skips an oversized result', async () => {
    const oversized = memory(
      'oversized',
      'user-a',
      'typescript '.repeat(40),
      '2026-06-12T19:00:00.000Z'
    );
    const compact = memory('compact', 'user-a', 'TypeScript', '2026-06-12T18:00:00.000Z');
    const repository = new InMemoryRepository([oversized, compact]);
    const budget = estimateMemoryTokens(compact.content);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript',
      tokenBudget: budget,
    });

    expect(result.map((record) => record.id)).toEqual(['compact']);
    expect(result.reduce((total, record) => total + estimateMemoryTokens(record.content), 0)).toBe(
      budget
    );
  });

  it('returns no memories for a zero budget even when candidates exist', async () => {
    const repository = new InMemoryRepository([
      memory('memory-1', 'user-a', 'Prefiere TypeScript', NOW.toISOString()),
    ]);

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript',
      tokenBudget: 0,
    });

    expect(result).toEqual([]);
  });

  it('defensively excludes records belonging to another user', async () => {
    const leaked = memory('leaked', 'user-b', 'Secreto TypeScript', '2026-06-12T19:00:00.000Z');
    const own = memory('own', 'user-a', 'Dato TypeScript', '2026-06-01T10:00:00.000Z');
    const repository: MemoryRepository = {
      findDedupCandidates: async () => [leaked, own],
      findRecallCandidates: async () => [leaked, own],
      create: async (input) => memory('created', input.userId, input.content, NOW.toISOString()),
    };

    const result = await retrieveMemories(repository, {
      userId: 'user-a',
      query: 'TypeScript',
      tokenBudget: 100,
    });

    expect(result.map((record) => record.id)).toEqual(['own']);
  });
});

describe('estimateMemoryTokens', () => {
  it('returns a deterministic positive estimate including framing overhead', () => {
    expect(estimateMemoryTokens('abc')).toBe(5);
    expect(estimateMemoryTokens('abcabc')).toBe(6);
  });
});
