import type { ProviderPlugin, ModelCapability, RoutingDecision } from "@chat/sdk";
import { prisma } from "./db";
import { getProvider } from "./provider-registry";
import { resolveProviderCredential, type RuntimeProviderCredential } from "./provider-credentials";

export interface SelectedProvider {
  model: ModelCapability;
  provider: ProviderPlugin;
  credential: RuntimeProviderCredential;
}

/**
 * Walks the routing decision — primary first, then fallbacks in order — and
 * returns the first candidate whose provider the user has an API key for AND
 * whose adapter resolves. Returns null when none are usable.
 *
 * This is what gives RoutingDecision.fallbacks a purpose: if the primary
 * provider isn't configured, we transparently fall back instead of 400-ing.
 */
export async function selectConfiguredProvider(
  decision: RoutingDecision,
  userId: string
): Promise<SelectedProvider | null> {
  const candidates = [decision.primary, ...decision.fallbacks];
  for (const model of candidates) {
    const config = await prisma.providerConfig.findUnique({
      where: { userId_providerId: { userId, providerId: model.provider } },
    });
    if (!config) continue;

    const credential = await resolveProviderCredential(config, prisma);
    const provider = getProvider(model.provider, credential.options);
    if (!provider) continue;

    return { model, provider, credential };
  }
  return null;
}
