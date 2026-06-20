import type { ChatRequest, RoutingDecision, UserPreference } from '@chat/sdk';
import { findCapableModels, getModel, getAllModels } from './registry';
import { defaultTierFor, isUseCaseEligible } from './capability-matrix';

function detectRequiredModalities(request: ChatRequest): string[] {
  const mods = new Set<string>(['text']);
  const lastMessage = request.messages[request.messages.length - 1];
  if (lastMessage?.attachments) {
    for (const att of lastMessage.attachments) {
      mods.add(att.type);
    }
  }
  return Array.from(mods);
}

function detectFeatures(request: ChatRequest): string[] {
  const features = new Set<string>();
  const content = request.messages
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();
  if (
    /code|function|json|schema|programming|c[oó]digo|funci[oó]n|programaci[oó]n|desarrolla/i.test(
      content
    )
  ) {
    features.add('tool-use');
  }
  if (
    /why|how|explain|reason|think|compare|por qu[eé]|c[oó]mo|explica|razona|compara|analiza/i.test(
      content
    )
  ) {
    features.add('reasoning');
  }
  return Array.from(features);
}

/**
 * Auto must have a stable, explainable preference order. Registry insertion
 * order changes with the Models.dev payload and DB query order, so it cannot
 * decide which model receives a user's request.
 */
function autoScore(model: {
  provider: string;
  modelId: string;
  features: string[];
  contextWindow?: number;
}): number {
  let score = defaultTierFor(model.provider, model.modelId) === 'strong' ? 32 : 12;
  if (model.features.includes('reasoning')) score += 12;
  if (model.features.includes('tool-use')) score += 8;
  if (model.features.includes('structured-output')) score += 4;
  score += Math.min(Math.log2(Math.max(model.contextWindow ?? 1, 1)), 20);
  return score;
}

function rankAutoCandidates<
  T extends {
    provider: string;
    modelId: string;
    features: string[];
    contextWindow?: number;
  },
>(candidates: T[]): T[] {
  return [...candidates].sort(
    (left, right) =>
      autoScore(right) - autoScore(left) ||
      left.provider.localeCompare(right.provider) ||
      left.modelId.localeCompare(right.modelId)
  );
}

export function route(request: ChatRequest, preferences?: UserPreference): RoutingDecision {
  // The use case drives which models are eligible: a model the capability
  // matrix excludes from solo/multi chat (e.g. an embedding model) must never
  // be routed here even if its declared modalities would otherwise match.
  const useCase: 'single' | 'multi' = preferences?.multiMode ? 'multi' : 'single';
  const eligible = (m: { provider: string; modelId: string }) =>
    isUseCaseEligible(m.provider, m.modelId, useCase);

  // 1. If forceProvider is specified, use it regardless of forceModel
  if (preferences?.forceProvider) {
    if (preferences?.forceModel) {
      const forced = getModel(preferences.forceProvider, preferences.forceModel);
      if (forced) {
        return { primary: forced, fallbacks: [] };
      }
    }

    // forceProvider without forceModel — pick first model from that provider
    const providerModels = findCapableModels(['text'], []).filter(
      (m) => m.provider === preferences.forceProvider && eligible(m)
    );
    if (providerModels.length > 0) {
      return { primary: providerModels[0], fallbacks: providerModels.slice(1) };
    }
  }

  // 2. If forceModel is specified but not forceProvider, find across all providers
  if (preferences?.forceModel) {
    const allModels = getAllModels();
    const forced = allModels.find((m) => m.modelId === preferences.forceModel);
    if (forced) {
      return { primary: forced, fallbacks: [] };
    }
  }

  // 3. Default routing based on request content
  const modalities = detectRequiredModalities(request);
  const features = detectFeatures(request);
  const candidates = rankAutoCandidates(findCapableModels(modalities, features).filter(eligible));

  if (candidates.length === 0) {
    const textFallbacks = rankAutoCandidates(findCapableModels(['text'], []).filter(eligible));
    if (textFallbacks.length === 0) {
      // Use a recognizable message so API endpoints can map this to a 422
      // with a clear user-facing error (Post-deploy #1: surfacing a clear
      // "no chat-capable model" message instead of an opaque upstream error
      // when Auto's only options are completion-only models like
      // openai/gpt-3.5-turbo-instruct routed through openrouter).
      throw new Error('No capable chat models available for this request');
    }
    return { primary: textFallbacks[0], fallbacks: textFallbacks.slice(1) };
  }

  const primary = candidates[0];
  const fallbacks = candidates.slice(1);

  if (preferences?.multiMode && candidates.length >= 2) {
    return {
      primary,
      fallbacks: [],
      multiModels: candidates.slice(0, 3),
    };
  }

  return { primary, fallbacks };
}
