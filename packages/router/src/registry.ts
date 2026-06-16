import type { ModelCapability, Modality, Feature } from "@chat/sdk";
import { getProviderCapabilities } from "./capability-matrix";

const registry = new Map<string, ModelCapability>();
const warnedProviders = new Set<string>();

export function registerModel(capability: ModelCapability): void {
  const key = `${capability.provider}:${capability.modelId}`;
  const caps = getProviderCapabilities(capability.provider);

  if (!caps) {
    if (!warnedProviders.has(capability.provider)) {
      warnedProviders.add(capability.provider);
      console.warn(
        `[capability-matrix] provider "${capability.provider}" has no matrix row — using permissive defaults (councilEligible=true, defaultTier=light). Add a row in packages/router/src/capability-matrix.ts to silence this warning.`
      );
    }
  } else {
    const unknownModalities = capability.modalities.filter(
      (m) => !caps.supportedModalities.includes(m as Modality)
    );
    const unknownFeatures = capability.features.filter(
      (f) => !caps.supportedFeatures.includes(f as Feature)
    );
    if (unknownModalities.length > 0 || unknownFeatures.length > 0) {
      console.warn(
        `[capability-matrix] ${capability.provider}:${capability.modelId} declares capabilities outside the matrix row: modalities=${JSON.stringify(unknownModalities)}, features=${JSON.stringify(unknownFeatures)}. Update capability-matrix.ts if this is intentional.`
      );
    }
  }

  registry.set(key, capability);
}

export function unregisterModel(provider: string, modelId: string): void {
  const key = `${provider}:${modelId}`;
  registry.delete(key);
}

export function findCapableModels(
  modalities: string[] = ["text"],
  features: string[] = []
): ModelCapability[] {
  const results: ModelCapability[] = [];
  for (const cap of registry.values()) {
    const hasModalities = modalities.every((m) => cap.modalities.includes(m as Modality));
    const hasFeatures = features.every((f) => cap.features.includes(f as Feature));
    if (hasModalities && hasFeatures) {
      results.push(cap);
    }
  }
  return results;
}

export function getAllModels(): ModelCapability[] {
  return Array.from(registry.values());
}

export function getModel(provider: string, modelId: string): ModelCapability | undefined {
  return registry.get(`${provider}:${modelId}`);
}

export function clearRegistry(): void {
  registry.clear();
  warnedProviders.clear();
}
