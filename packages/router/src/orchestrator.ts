import type {
  ChatRequest,
  RoutingDecision,
  UserPreference,
} from "@chat/sdk";
import { findCapableModels, getModel, getAllModels } from "./registry";
import { isUseCaseEligible } from "./capability-matrix";

function detectRequiredModalities(request: ChatRequest): string[] {
  const mods = new Set<string>(["text"]);
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
  const content = request.messages.map((m) => m.content).join(" ").toLowerCase();
  if (/code|function|json|schema|programming/i.test(content)) {
    features.add("tool-use");
  }
  if (/why|how|explain|reason|think|compare/i.test(content)) {
    features.add("reasoning");
  }
  return Array.from(features);
}

export function route(
  request: ChatRequest,
  preferences?: UserPreference
): RoutingDecision {
  // The use case drives which models are eligible: a model the capability
  // matrix excludes from solo/multi chat (e.g. an embedding model) must never
  // be routed here even if its declared modalities would otherwise match.
  const useCase: "single" | "multi" = preferences?.multiMode ? "multi" : "single";
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
    const providerModels = findCapableModels(["text"], []).filter(
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
  const candidates = findCapableModels(modalities, features).filter(eligible);

  if (candidates.length === 0) {
    const textFallbacks = findCapableModels(["text"], []).filter(eligible);
    if (textFallbacks.length === 0) {
      throw new Error("No capable models available");
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
