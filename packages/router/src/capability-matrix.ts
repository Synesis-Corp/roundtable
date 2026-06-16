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
