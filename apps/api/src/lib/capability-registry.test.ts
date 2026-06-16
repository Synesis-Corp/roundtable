import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted above imports — hoisted() ensures the spies exist
// before the factory runs.
const { mockRegisterModel, mockGetAllModels, mockPrisma } = vi.hoisted(() => {
  const mockRegisterModel = vi.fn();
  const mockGetAllModels = vi.fn(() => []);
  const mockPrisma = {
    capabilityEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { mockRegisterModel, mockGetAllModels, mockPrisma };
});

vi.mock('@chat/router', () => ({
  registerModel: mockRegisterModel,
  getAllModels: mockGetAllModels,
}));

vi.mock('./db', () => ({ prisma: mockPrisma }));

import { loadCapabilitiesFromDb, persistCapabilities } from './capability-registry';

describe('capability-registry (models.dev → DB fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.capabilityEntry.findMany.mockResolvedValue([]);
  });

  describe('loadCapabilitiesFromDb', () => {
    it('loads active entries from the DB and registers them in the router', async () => {
      mockPrisma.capabilityEntry.findMany.mockResolvedValue([
        {
          modelId: 'gpt-4o',
          providerId: 'openai',
          modalities: ['text', 'image'],
          features: ['tool-use', 'vision'],
          contextWindow: 128000,
        },
        {
          modelId: 'claude-3-opus',
          providerId: 'anthropic',
          modalities: ['text'],
          features: ['reasoning'],
          contextWindow: null,
        },
      ]);

      const count = await loadCapabilitiesFromDb();

      expect(count).toBe(2);
      expect(mockRegisterModel).toHaveBeenCalledTimes(2);
      expect(mockRegisterModel).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'gpt-4o',
          provider: 'openai',
          modalities: ['text', 'image'],
          features: ['tool-use', 'vision'],
          contextWindow: 128000,
        })
      );
      expect(mockRegisterModel).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'claude-3-opus',
          provider: 'anthropic',
          contextWindow: undefined, // null → undefined
        })
      );
    });

    it('returns 0 and registers nothing when the DB is empty', async () => {
      const count = await loadCapabilitiesFromDb();
      expect(count).toBe(0);
      expect(mockRegisterModel).not.toHaveBeenCalled();
    });

    it('survives a models.dev outage — the DB cache is the fallback', async () => {
      // This test documents the architecture: when models.dev is unreachable,
      // the API calls loadCapabilitiesFromDb on boot (before any fetch to
      // models.dev). The DB acts as a durable cache so routing and chat work
      // immediately after a restart, even with models.dev fully down.
      mockPrisma.capabilityEntry.findMany.mockResolvedValue([
        {
          modelId: 'gemini-1.5-pro',
          providerId: 'google',
          modalities: ['text'],
          features: ['structured-output'],
          contextWindow: 1000000,
        },
      ]);

      const count = await loadCapabilitiesFromDb();
      expect(count).toBe(1);
      expect(mockRegisterModel).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistCapabilities', () => {
    it('mirrors capabilities to the DB as a fresh snapshot', async () => {
      // $transaction destructures: const [, created] = await $transaction([...])
      mockPrisma.$transaction.mockResolvedValueOnce([
        { count: 0 }, // deleteMany result
        { count: 1 }, // createMany result
      ]);

      const caps = [
        {
          modelId: 'gpt-4o',
          provider: 'openai',
          modalities: ['text'] as const,
          features: ['tool-use'] as const,
          contextWindow: 128000,
        },
      ];

      const count = await persistCapabilities(caps);

      expect(count).toBe(1);
      expect(mockPrisma.capabilityEntry.deleteMany).toHaveBeenCalledWith({});
      expect(mockPrisma.capabilityEntry.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              modelId: 'gpt-4o',
              providerId: 'openai',
              isActive: true,
            }),
          ]),
          skipDuplicates: true,
        })
      );
    });
  });
});
