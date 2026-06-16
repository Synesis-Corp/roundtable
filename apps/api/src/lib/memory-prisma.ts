import type { CreateMemoryRecord, MemoryRecord, MemoryRepository, MemorySource } from './memory';

export interface PrismaMemoryRow {
  id: string;
  userId: string;
  content: string;
  sourceType: string | null;
  sourceConversationId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaMemoryClient {
  memory: {
    findMany(args: {
      where: { userId: string };
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
      take: number;
    }): Promise<PrismaMemoryRow[]>;
    create(args: {
      data: {
        userId: string;
        content: string;
        sourceType: string | null;
        sourceConversationId: string | null;
        tags: string[];
      };
    }): Promise<PrismaMemoryRow>;
  };
}

const RECENCY_ORDER = [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] as const;

export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly client: PrismaMemoryClient) {}

  async findDedupCandidates(userId: string, limit: number): Promise<readonly MemoryRecord[]> {
    return this.findCandidates(userId, limit);
  }

  async findRecallCandidates(userId: string, limit: number): Promise<readonly MemoryRecord[]> {
    return this.findCandidates(userId, limit);
  }

  async create(input: CreateMemoryRecord): Promise<MemoryRecord> {
    const source = serializeSource(input.source);
    const row = await this.client.memory.create({
      data: {
        userId: input.userId,
        content: input.content,
        sourceType: source.sourceType,
        sourceConversationId: source.sourceConversationId,
        tags: [...input.tags],
      },
    });

    return mapMemory(row);
  }

  private async findCandidates(userId: string, limit: number): Promise<MemoryRecord[]> {
    const rows = await this.client.memory.findMany({
      where: { userId },
      orderBy: RECENCY_ORDER.map((entry) => ({ ...entry })),
      take: limit,
    });

    return rows.map(mapMemory);
  }
}

function serializeSource(source: MemorySource | null): {
  sourceType: string | null;
  sourceConversationId: string | null;
} {
  if (!source) {
    return { sourceType: null, sourceConversationId: null };
  }

  if (source.type === 'manual') {
    return { sourceType: 'manual', sourceConversationId: null };
  }

  return {
    sourceType: 'conversation',
    sourceConversationId: source.conversationId,
  };
}

function mapMemory(row: PrismaMemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.userId,
    content: row.content,
    source: deserializeSource(row.sourceType, row.sourceConversationId),
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function deserializeSource(
  sourceType: string | null,
  sourceConversationId: string | null
): MemorySource | null {
  if (sourceType === 'manual' && sourceConversationId === null) {
    return { type: 'manual' };
  }

  if (sourceType === 'conversation' && sourceConversationId) {
    return { type: 'conversation', conversationId: sourceConversationId };
  }

  return null;
}
