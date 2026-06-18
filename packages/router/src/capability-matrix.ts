import type { Modality, Feature } from '@chat/sdk';

export type CouncilTier = 'strong' | 'light' | 'none';

/**
 * The places a model can be routed to. Each is a distinct decision point that
 * may want to exclude a model the adapter technically exposes but shouldn't be
 * used for: e.g. an embedding model must never run Council deliberation, title
 * generation, or memory extraction.
 */
export type UseCase = 'council' | 'single' | 'multi' | 'title' | 'memory-extraction';

export const ALL_USE_CASES: readonly UseCase[] = [
  'council',
  'single',
  'multi',
  'title',
  'memory-extraction',
];

export interface ProviderCapabilities {
  supportedModalities: Modality[];
  supportedFeatures: Feature[];
  councilEligible: boolean;
  defaultTier: CouncilTier;
  /**
   * Per-model use-case exclusions: `modelId` → the use cases that model must
   * NOT be routed to. A model absent from this map is eligible for everything
   * the provider supports. Replaces the council-only `councilIneligibleModelIds`.
   */
  modelExclusions?: Readonly<Record<string, readonly UseCase[]>>;
}

export const ProviderCapabilityMatrix: Record<string, ProviderCapabilities> = {
  openai: {
    supportedModalities: ['text', 'image', 'pdf', 'file', 'audio'],
    supportedFeatures: ['reasoning', 'tool-use', 'structured-output', 'vision', 'pdf-input'],
    councilEligible: true,
    defaultTier: 'strong',
    // These are not chat models (image gen, transcription, TTS, embeddings):
    // they can't produce a chat completion, so they're excluded everywhere.
    modelExclusions: {
      'dall-e-3': ALL_USE_CASES,
      'gpt-image-1': ALL_USE_CASES,
      'whisper-1': ALL_USE_CASES,
      'tts-1': ALL_USE_CASES,
      'tts-1-hd': ALL_USE_CASES,
      'text-embedding-3-small': ALL_USE_CASES,
      'text-embedding-3-large': ALL_USE_CASES,
      'text-embedding-ada-002': ALL_USE_CASES,
    },
  },
  anthropic: {
    supportedModalities: ['text', 'image', 'pdf', 'file'],
    supportedFeatures: ['tool-use', 'vision', 'pdf-input'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  google: {
    supportedModalities: ['text', 'image', 'pdf', 'file', 'audio'],
    supportedFeatures: ['tool-use', 'vision', 'pdf-input'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  openrouter: {
    supportedModalities: ['text', 'image', 'file', 'audio', 'pdf'],
    supportedFeatures: ['tool-use', 'structured-output', 'vision', 'pdf-input'],
    councilEligible: true,
    defaultTier: 'strong',
    // Post-deploy #1 (2026-06-18) v2: the original exclusion only covered
    // completion-only models (gpt-3.5-turbo-instruct, davinci, etc.). The
    // user hit a NEW failure mode in prod: the registry knows about
    // `gpt-5.2-pro` (a phantom / "próximamente" model listed in Models.dev
    // but not yet released by OpenAI) and the router picked it. OpenAI
    // returned 404 with the misleading "This is not a chat model" error.
    // We now exclude: (a) all known completion-only IDs, (b) all known
    // "phantom" OpenAI models the registry knows about that don't actually
    // exist yet, and (c) all embedding models. Combined with the runtime
    // retry loop in `runChatGeneration` (apps/api/src/routes/chat.ts), this
    // makes Auto robust to any future phantom-model additions.
    modelExclusions: {
      // Completion-only (legacy GPT-3 + OpenRouter duplicates)
      'openai/gpt-3.5-turbo-instruct': ALL_USE_CASES,
      'openai/davinci-002': ALL_USE_CASES,
      'openai/babbage-002': ALL_USE_CASES,
      'openai/text-davinci-002': ALL_USE_CASES,
      'openai/text-davinci-003': ALL_USE_CASES,
      'openai/ada': ALL_USE_CASES,
      'openai/curie': ALL_USE_CASES,
      'openai/text-ada-001': ALL_USE_CASES,
      'openai/text-curie-001': ALL_USE_CASES,
      // Phantom / not-yet-released OpenAI models (registry knows them; the
      // upstream API returns 404 with a misleading "not a chat model" error).
      'openai/gpt-5.2-pro': ALL_USE_CASES,
      'openai/gpt-5.2': ALL_USE_CASES,
      'openai/gpt-5.1-pro': ALL_USE_CASES,
      'openai/gpt-5.1': ALL_USE_CASES,
      'openai/gpt-5-pro': ALL_USE_CASES,
      'openai/gpt-4.7': ALL_USE_CASES,
      'openai/gpt-4.6': ALL_USE_CASES,
      'openai/gpt-4.5-preview': ALL_USE_CASES,
      'openai/gpt-4.5': ALL_USE_CASES,
      'openai/o3-pro': ALL_USE_CASES,
      'openai/o3-mini-high': ALL_USE_CASES,
      'openai/o4-mini': ALL_USE_CASES,
      'openai/o4': ALL_USE_CASES,
      // Embeddings (also can't produce chat completions)
      'openai/text-embedding-3-small': ALL_USE_CASES,
      'openai/text-embedding-3-large': ALL_USE_CASES,
      'openai/text-embedding-ada-002': ALL_USE_CASES,
    },
  },
  deepseek: {
    supportedModalities: ['text'],
    supportedFeatures: ['reasoning', 'tool-use', 'structured-output'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  groq: {
    supportedModalities: ['text'],
    supportedFeatures: ['tool-use'],
    councilEligible: true,
    defaultTier: 'light',
  },
  mistral: {
    supportedModalities: ['text', 'image'],
    supportedFeatures: ['tool-use', 'vision'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  cohere: {
    supportedModalities: ['text'],
    supportedFeatures: ['tool-use', 'structured-output'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  perplexity: {
    supportedModalities: ['text'],
    supportedFeatures: ['tool-use'],
    councilEligible: true,
    defaultTier: 'light',
  },
  xai: {
    supportedModalities: ['text', 'image'],
    supportedFeatures: ['tool-use', 'vision'],
    councilEligible: true,
    defaultTier: 'strong',
  },
  opencode: {
    supportedModalities: ['text'],
    supportedFeatures: ['tool-use'],
    councilEligible: true,
    defaultTier: 'light',
  },
};

export function getProviderCapabilities(provider: string): ProviderCapabilities | undefined {
  return ProviderCapabilityMatrix[provider];
}

/**
 * Whether a `(provider, modelId)` may be routed to a given use case. Fail-open:
 * unknown providers and unlisted models are eligible. Council additionally
 * honours the provider-wide `councilEligible` flag.
 */
export function isUseCaseEligible(provider: string, modelId: string, useCase: UseCase): boolean {
  const caps = ProviderCapabilityMatrix[provider];
  if (!caps) return true;
  if (useCase === 'council' && !caps.councilEligible) return false;
  const excluded = caps.modelExclusions?.[modelId];
  return !excluded?.includes(useCase);
}

export function isCouncilEligible(provider: string, modelId: string): boolean {
  return isUseCaseEligible(provider, modelId, 'council');
}

export function defaultTierFor(provider: string, _modelId: string): CouncilTier {
  const caps = ProviderCapabilityMatrix[provider];
  if (!caps) return 'light';
  return caps.defaultTier;
}
