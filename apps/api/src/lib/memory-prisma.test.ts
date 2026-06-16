import { describe, expect, it, vi } from 'vitest';
import { PrismaMemoryRepository, type PrismaMemoryClient } from './memory-prisma';

const UPDATED_AT = new Date('2026-06-12T20:00:00.000Z');
const CREATED_AT = new Date('2026-06-10T10:00:00.000Z');

function databaseMemory(
  overrides: Partial<{
    id: string;
    userId: string;
    content: string;
    sourceType: string | null;
    sourceConversationId: string | null;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: 'memory-1',
    userId: 'user-a',
    content: 'Está construyendo Roundtable',
    sourceType: 'conversation',
    sourceConversationId: 'conversation-1',
    tags: ['project'],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createClient() {
  return {
    memory: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  } satisfies PrismaMemoryClient;
}

describe('PrismaMemoryRepository', () => {
  it('loads user-scoped dedup candidates by recency and maps conversation sources', async () => {
    const client = createClient();
    client.memory.findMany.mockResolvedValueOnce([databaseMemory()]);
    const repository = new PrismaMemoryRepository(client);

    const result = await repository.findDedupCandidates('user-a', 25);

    expect(client.memory.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 25,
    });
    expect(result).toEqual([
      {
        id: 'memory-1',
        userId: 'user-a',
        content: 'Está construyendo Roundtable',
        source: { type: 'conversation', conversationId: 'conversation-1' },
        tags: ['project'],
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      },
    ]);
  });

  it('maps manual and malformed database sources without inventing a conversation id', async () => {
    const client = createClient();
    client.memory.findMany.mockResolvedValueOnce([
      databaseMemory({
        id: 'manual',
        sourceType: 'manual',
        sourceConversationId: null,
      }),
      databaseMemory({
        id: 'malformed',
        sourceType: 'conversation',
        sourceConversationId: null,
      }),
    ]);
    const repository = new PrismaMemoryRepository(client);

    const result = await repository.findRecallCandidates('user-a', 10);

    expect(result.map((memory) => memory.source)).toEqual([{ type: 'manual' }, null]);
  });

  it('persists a conversation source in separate unambiguous columns', async () => {
    const client = createClient();
    client.memory.create.mockResolvedValueOnce(databaseMemory());
    const repository = new PrismaMemoryRepository(client);

    await repository.create({
      userId: 'user-a',
      content: 'Está construyendo Roundtable',
      source: { type: 'conversation', conversationId: 'conversation-1' },
      tags: ['project'],
    });

    expect(client.memory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-a',
        content: 'Está construyendo Roundtable',
        sourceType: 'conversation',
        sourceConversationId: 'conversation-1',
        tags: ['project'],
      },
    });
  });

  it('persists manual sources without an ambiguous source identifier', async () => {
    const client = createClient();
    client.memory.create.mockResolvedValueOnce(
      databaseMemory({
        sourceType: 'manual',
        sourceConversationId: null,
      })
    );
    const repository = new PrismaMemoryRepository(client);

    const result = await repository.create({
      userId: 'user-a',
      content: 'Prefiere respuestas directas',
      source: { type: 'manual' },
      tags: [],
    });

    expect(client.memory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-a',
        content: 'Prefiere respuestas directas',
        sourceType: 'manual',
        sourceConversationId: null,
        tags: [],
      },
    });
    expect(result.source).toEqual({ type: 'manual' });
  });
});
