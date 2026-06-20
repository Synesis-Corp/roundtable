import type { ProviderPlugin, ModelCapability, RoutingDecision } from '@chat/sdk';
import { prisma } from './db';
import { getProvider } from './provider-registry';
import { resolveProviderCredential, type RuntimeProviderCredential } from './provider-credentials';

export interface SelectedProvider {
  model: ModelCapability;
  provider: ProviderPlugin;
  credential: RuntimeProviderCredential;
}

async function getActiveModelAllowlist(userId: string): Promise<Map<string, Set<string>>> {
  const configs = await prisma.activeModelsConfig.findMany({
    where: { userId },
    select: { providerId: true, modelIds: true },
  });
  return new Map(configs.map((config) => [config.providerId, new Set(config.modelIds)]));
}

function isActiveModel(model: ModelCapability, allowlist: Map<string, Set<string>>): boolean {
  const providerModels = allowlist.get(model.provider);
  return !providerModels || providerModels.has(model.modelId);
}

/**
 * Resolves a single routing candidate into a usable provider: the user must
 * have an API key for it AND its adapter must resolve. Returns null otherwise.
 * Shared by both selectors below so the skip rules live in one place.
 */
async function resolveCandidate(
  model: ModelCapability,
  userId: string
): Promise<SelectedProvider | null> {
  const config = await prisma.providerConfig.findUnique({
    where: { userId_providerId: { userId, providerId: model.provider } },
  });
  if (!config) return null;

  const credential = await resolveProviderCredential(config, prisma);
  const provider = getProvider(model.provider, credential.options);
  if (!provider) return null;

  return { model, provider, credential };
}

/**
 * Walks the routing decision — primary first, then fallbacks in order — and
 * returns the first candidate whose provider the user has an API key for AND
 * whose adapter resolves. Returns null when none are usable. Stops at the
 * first match (cheap path for callers that only need one).
 *
 * This is what gives RoutingDecision.fallbacks a purpose: if the primary
 * provider isn't configured, we transparently fall back instead of 400-ing.
 */
export async function selectConfiguredProvider(
  decision: RoutingDecision,
  userId: string
): Promise<SelectedProvider | null> {
  const allowlist = await getActiveModelAllowlist(userId);
  const candidates = [decision.primary, ...decision.fallbacks];
  for (const model of candidates) {
    if (!isActiveModel(model, allowlist)) continue;
    const selected = await resolveCandidate(model, userId);
    if (selected) return selected;
  }
  return null;
}

/**
 * Post-deploy #1 v2 (2026-06-18): returns ALL configured candidates, in
 * routing-priority order. Used by the chat stream endpoint to pick the primary
 * (index 0) and feed the rest to the runtime retry loop in `runChatGeneration`
 * — when the upstream rejects a phantom / "próximamente" model with 404, the
 * stream silently swaps to the next candidate instead of 500-ing.
 *
 * Skips the same entries `selectConfiguredProvider` skips (no API key, no
 * adapter). Returns an empty array when no candidates are usable.
 */
export async function selectAllConfiguredProviders(
  decision: RoutingDecision,
  userId: string
): Promise<SelectedProvider[]> {
  const allowlist = await getActiveModelAllowlist(userId);
  const candidates = [decision.primary, ...decision.fallbacks];
  const out: SelectedProvider[] = [];
  for (const model of candidates) {
    if (!isActiveModel(model, allowlist)) continue;
    const selected = await resolveCandidate(model, userId);
    if (selected) out.push(selected);
  }
  return out;
}
