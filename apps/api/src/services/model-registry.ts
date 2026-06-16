import type { Modality, Feature } from '@chat/sdk';
import { getAllModels, getEffortSpec, registerModel } from '@chat/router';
import type { EffortModelMetadata, EffortSpec } from '@chat/router';
import {
  fetchModelsDev,
  getModelsDevCache,
  getModelsDevFetchError,
  type ModelsDevModel,
  type ModelsDevProvider,
} from '@chat/providers';
import { logger } from '../lib/logger';
import { loadCapabilitiesFromDb, persistCapabilities } from '../lib/capability-registry';

// ── Public API: models.dev → Feature mapping ────────────────────────────────

/**
 * Maps a single `models.dev` model record to the canonical `Feature` array
 * consumed by the router registry.
 *
 * Pre-Cleanup (2026-06-11) mapping was misleading:
 *   - `tool_call`        → "code"            (now: "tool-use")
 *   - `structured_output` → "long-context"    (now: "structured-output")
 *   - `attachment`        → "vision"          (now: only when modalities.input includes "image")
 *   - "pdf-input" was absent (now: derived from modalities.input)
 *
 * The post-Cleanup mapping is semantic and orthogonal. See ADR-0007.
 */
export function mapModelsDevFeatures(model: ModelsDevModel): Feature[] {
  const features: Feature[] = [];
  if (model.reasoning) features.push('reasoning');
  if (model.tool_call) features.push('tool-use');
  if (model.structured_output) features.push('structured-output');
  if (model.attachment && model.modalities?.input?.includes('image')) {
    features.push('vision');
  }
  if (model.modalities?.input?.includes('pdf')) {
    features.push('pdf-input');
  }
  return features;
}

// ── Public types ───────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
}

export interface AvailableProvider {
  id: string;
  name: string;
  npm: string;
  doc: string;
  env: string[];
  modelCount: number;
  popular: boolean;
  models: ModelInfo[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const POPULAR_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'opencode',
  'groq',
  'mistral',
  'cohere',
  'openrouter',
  'deepseek',
  'perplexity',
  'fireworks-ai',
  'togetherai',
  'azure',
  'xai',
  'amazon-bedrock',
];

// ── Registry population ────────────────────────────────────────────────────

function populateRouterRegistry(): void {
  const cache = getModelsDevCache();
  if (!cache) return;

  for (const [providerId, provider] of cache) {
    for (const [, model] of Object.entries(provider.models)) {
      // Note: the policy of "what features each provider supports" lives in
      // packages/router/src/capability-matrix.ts. Here we only translate the
      // raw models.dev fields into the canonical Feature vocabulary.
      const features = mapModelsDevFeatures(model);

      registerModel({
        modelId: model.id,
        provider: providerId,
        modalities: (model.modalities?.input ?? ['text']) as Modality[],
        features,
        contextWindow: model.limit?.context,
      });
    }
  }

  logger.info(
    { modelCount: getAllModels().length },
    'providers: registered models from Models.dev into router registry'
  );
}

// ── Boot sequence ──────────────────────────────────────────────────────────

export async function initCapabilityRegistry(): Promise<void> {
  try {
    const loaded = await loadCapabilitiesFromDb();
    if (loaded > 0) {
      logger.info({ count: loaded }, 'providers: loaded capabilities from DB cache');
    }
  } catch (err) {
    logger.error({ err }, 'providers: failed to load capabilities from DB');
  }

  await fetchModelsDev();
  const cache = getModelsDevCache();
  if (!cache) {
    logger.error(
      { err: getModelsDevFetchError() },
      'providers: failed to fetch Models.dev — serving DB-cached capabilities'
    );
    return;
  }

  logger.info({ providerCount: cache.size }, 'providers: fetched providers from Models.dev');
  populateRouterRegistry();

  try {
    const persisted = await persistCapabilities(getAllModels());
    logger.info({ count: persisted }, 'providers: persisted capabilities to DB');
  } catch (err) {
    logger.error({ err }, 'providers: failed to persist capabilities to DB');
  }
}

// ── Model scoring and selection ────────────────────────────────────────────

export function extractTopModels(provider: ModelsDevProvider, maxModels = 5): ModelInfo[] {
  const modelEntries = Object.entries(provider.models);

  const scored = modelEntries.map(([, model]) => {
    let score = 0;
    if (model.reasoning) score += 3;
    if (model.tool_call) score += 2;
    if (model.structured_output) score += 1;
    if (model.attachment) score += 2;
    score += Math.log10(model.limit?.context ?? 1);
    return { model, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxModels).map(({ model }) => {
    const capabilities: string[] = [];
    if (model.modalities?.input?.includes('text')) capabilities.push('text');
    if (model.modalities?.input?.includes('image')) capabilities.push('image');
    if (model.modalities?.input?.includes('audio')) capabilities.push('audio');
    if (model.modalities?.input?.includes('pdf')) capabilities.push('pdf');
    if (model.reasoning) capabilities.push('reasoning');
    if (model.tool_call) capabilities.push('tools');

    const parts: string[] = [];
    if (capabilities.length > 0) parts.push(capabilities.join(' + '));
    if (model.limit?.context) {
      // Collapse millions into "M" (1000K and 1050K both read as 1M); only use
      // "K" below 1M. Avoids the confusing "1000K context" / "2000K context".
      const c = model.limit.context;
      const ctx =
        c >= 1_000_000
          ? `${Math.round(c / 1_000_000)}M context`
          : c >= 1_000
            ? `${Math.round(c / 1_000)}K context`
            : `${c} context`;
      parts.push(ctx);
    }

    return {
      id: model.id,
      name: model.name,
      provider: provider.id,
      description: parts.join(', ') || 'Text generation',
      contextWindow: model.limit?.context ?? 0,
      capabilities,
    };
  });
}

export function getAvailableProviders(): AvailableProvider[] {
  const cache = getModelsDevCache();
  if (!cache) return [];

  const providers: AvailableProvider[] = [];
  for (const [, provider] of cache) {
    providers.push({
      id: provider.id,
      name: provider.name,
      npm: provider.npm,
      doc: provider.doc,
      env: provider.env,
      modelCount: Object.keys(provider.models).length,
      popular: POPULAR_PROVIDER_IDS.includes(provider.id),
      models: extractTopModels(provider),
    });
  }

  providers.sort((a, b) => {
    if (a.popular && !b.popular) return -1;
    if (!a.popular && b.popular) return 1;
    return a.name.localeCompare(b.name);
  });

  return providers;
}

// ── Effort spec helpers ────────────────────────────────────────────────────

function findModelsDevModel(
  providerId: string,
  modelId: string
): {
  provider: ModelsDevProvider;
  model: ModelsDevModel;
} | null {
  const provider = getModelsDevCache()?.get(providerId);
  if (!provider) return null;

  const direct = provider.models[modelId];
  if (direct) return { provider, model: direct };

  const model = Object.values(provider.models).find((candidate) => candidate.id === modelId);
  return model ? { provider, model } : null;
}

function getEffortMetadata(
  provider: ModelsDevProvider,
  model: ModelsDevModel
): EffortModelMetadata {
  return {
    apiId: model.id,
    npm: model.provider?.npm ?? provider.npm ?? '@ai-sdk/openai-compatible',
    reasoning: model.reasoning,
    releaseDate: model.release_date ?? '',
    outputLimit: model.limit?.output,
  };
}

export function getModelEffortSpec(providerId: string, modelId: string): EffortSpec | null {
  const found = findModelsDevModel(providerId, modelId);
  if (!found) return null;
  return getEffortSpec(providerId, modelId, getEffortMetadata(found.provider, found.model));
}
