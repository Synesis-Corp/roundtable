import type { ModelCapability, Modality, Feature } from '@chat/sdk';
import { registerModel } from '@chat/router';
import { prisma } from './db';

/**
 * Persistence bridge between the DB (CapabilityEntry) and the in-memory router
 * registry. The router package stays pure (no DB); this app-layer module keeps
 * the registry durable across restarts and resilient to a models.dev outage.
 */

/**
 * Loads persisted capabilities from the DB into the in-memory router registry.
 * Run on boot BEFORE fetching models.dev so routing works immediately after a
 * restart and survives a models.dev outage. Returns how many models loaded.
 */
export async function loadCapabilitiesFromDb(): Promise<number> {
  const entries = await prisma.capabilityEntry.findMany({ where: { isActive: true } });
  for (const e of entries) {
    registerModel({
      modelId: e.modelId,
      provider: e.providerId,
      modalities: e.modalities as Modality[],
      features: e.features as Feature[],
      contextWindow: e.contextWindow ?? undefined,
    });
  }
  return entries.length;
}

/**
 * Mirrors the given capabilities into the DB as a fresh snapshot. models.dev is
 * the source of truth; the table is a durable cache. A transactional
 * delete-all + bulk insert keeps the DB an exact mirror in two statements
 * (far cheaper than per-row upserts for thousands of models). Returns inserted
 * row count.
 */
export async function persistCapabilities(caps: ModelCapability[]): Promise<number> {
  const data = caps.map((c) => ({
    modelId: c.modelId,
    providerId: c.provider,
    modalities: c.modalities,
    features: c.features,
    contextWindow: c.contextWindow ?? null,
    isActive: true,
  }));

  const [, created] = await prisma.$transaction([
    prisma.capabilityEntry.deleteMany({}),
    prisma.capabilityEntry.createMany({ data, skipDuplicates: true }),
  ]);

  return (created as { count: number }).count;
}
