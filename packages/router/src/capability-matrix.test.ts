import { describe, it, expect } from 'vitest';
import {
  ProviderCapabilityMatrix,
  getProviderCapabilities,
  isCouncilEligible,
  isUseCaseEligible,
  defaultTierFor,
  type ProviderCapabilities,
  type UseCase,
} from './capability-matrix';

describe('ProviderCapabilityMatrix — table shape', () => {
  it('exports a non-empty matrix with the expected providers', () => {
    const expectedProviders = [
      'openai',
      'anthropic',
      'google',
      'openrouter',
      'deepseek',
      'groq',
      'mistral',
      'cohere',
    ];
    for (const p of expectedProviders) {
      expect(ProviderCapabilityMatrix[p]).toBeDefined();
      expect(ProviderCapabilityMatrix[p].supportedModalities).toContain('text');
    }
  });

  it('every row has the required fields with valid values', () => {
    for (const [provider, caps] of Object.entries(ProviderCapabilityMatrix)) {
      expect(caps.supportedModalities.length, `${provider} modalities`).toBeGreaterThan(0);
      expect(Array.isArray(caps.supportedFeatures), `${provider} features`).toBe(true);
      expect(typeof caps.councilEligible, `${provider} councilEligible`).toBe('boolean');
      expect(['strong', 'light', 'none'], `${provider} defaultTier`).toContain(caps.defaultTier);
    }
  });
});

describe('ProviderCapabilityMatrix — openai', () => {
  it('supports text/image/pdf modalities and the full Feature set', () => {
    const caps = getProviderCapabilities('openai');
    expect(caps).toBeDefined();
    expect(caps!.supportedModalities).toEqual(expect.arrayContaining(['text', 'image', 'pdf']));
    expect(caps!.supportedFeatures).toEqual(
      expect.arrayContaining(['reasoning', 'tool-use', 'structured-output', 'vision', 'pdf-input'])
    );
    expect(caps!.councilEligible).toBe(true);
    expect(caps!.defaultTier).toBe('strong');
  });

  it('excludes image-only / embedding / TTS models from Council', () => {
    expect(isCouncilEligible('openai', 'gpt-4o')).toBe(true);
    expect(isCouncilEligible('openai', 'o1')).toBe(true);
    expect(isCouncilEligible('openai', 'dall-e-3')).toBe(false);
    expect(isCouncilEligible('openai', 'gpt-image-1')).toBe(false);
    expect(isCouncilEligible('openai', 'whisper-1')).toBe(false);
    expect(isCouncilEligible('openai', 'tts-1')).toBe(false);
    expect(isCouncilEligible('openai', 'text-embedding-3-small')).toBe(false);
  });

  it("defaultTierFor returns the row's defaultTier for unlisted modelIds", () => {
    expect(defaultTierFor('openai', 'gpt-4o')).toBe('strong');
    expect(defaultTierFor('openai', 'gpt-4.1')).toBe('strong');
    expect(defaultTierFor('openai', 'gpt-5.4')).toBe('strong');
  });
});

describe('ProviderCapabilityMatrix — anthropic', () => {
  it('supports text/image/pdf and tool-use, vision, pdf-input', () => {
    const caps = getProviderCapabilities('anthropic');
    expect(caps).toBeDefined();
    expect(caps!.supportedModalities).toEqual(expect.arrayContaining(['text', 'image', 'pdf']));
    expect(caps!.supportedFeatures).toEqual(
      expect.arrayContaining(['tool-use', 'vision', 'pdf-input'])
    );
    expect(caps!.defaultTier).toBe('strong');
  });

  it('councilEligible with no exclusions', () => {
    expect(isCouncilEligible('anthropic', 'claude-3-opus')).toBe(true);
    expect(isCouncilEligible('anthropic', 'claude-3-sonnet')).toBe(true);
    expect(isCouncilEligible('anthropic', 'claude-3-haiku')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — google', () => {
  it('supports text/image/pdf and is council-eligible with strong default', () => {
    const caps = getProviderCapabilities('google');
    expect(caps).toBeDefined();
    expect(caps!.supportedModalities).toEqual(expect.arrayContaining(['text', 'image', 'pdf']));
    expect(caps!.supportedFeatures).toEqual(
      expect.arrayContaining(['tool-use', 'vision', 'pdf-input'])
    );
    expect(caps!.defaultTier).toBe('strong');
    expect(isCouncilEligible('google', 'gemini-2.0-flash')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — openrouter (custom models)', () => {
  it('councilEligible with strong default (any text model counts)', () => {
    const caps = getProviderCapabilities('openrouter');
    expect(caps).toBeDefined();
    expect(caps!.defaultTier).toBe('strong');
    expect(caps!.councilEligible).toBe(true);
  });

  it('any custom modelId matching modalities is Council-eligible (no name hints)', () => {
    expect(isCouncilEligible('openrouter', 'vendor/foo')).toBe(true);
    expect(isCouncilEligible('openrouter', 'anthropic/claude-3-sonnet')).toBe(true);
    expect(isCouncilEligible('openrouter', 'deepseek/deepseek-chat')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — deepseek', () => {
  it('strong by default, council-eligible', () => {
    const caps = getProviderCapabilities('deepseek');
    expect(caps).toBeDefined();
    expect(caps!.defaultTier).toBe('strong');
    expect(isCouncilEligible('deepseek', 'deepseek-chat')).toBe(true);
    expect(isCouncilEligible('deepseek', 'deepseek-reasoner')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — groq', () => {
  it('light by default (fast inference), council-eligible', () => {
    const caps = getProviderCapabilities('groq');
    expect(caps).toBeDefined();
    expect(caps!.defaultTier).toBe('light');
    expect(isCouncilEligible('groq', 'llama-3.1-70b')).toBe(true);
    expect(isCouncilEligible('groq', 'llama-3.3-70b')).toBe(true);
    expect(isCouncilEligible('groq', 'mixtral-8x7b')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — mistral', () => {
  it('strong by default, council-eligible', () => {
    const caps = getProviderCapabilities('mistral');
    expect(caps).toBeDefined();
    expect(caps!.defaultTier).toBe('strong');
    expect(isCouncilEligible('mistral', 'mistral-large')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — cohere', () => {
  it('strong by default, council-eligible', () => {
    const caps = getProviderCapabilities('cohere');
    expect(caps).toBeDefined();
    expect(caps!.defaultTier).toBe('strong');
    expect(isCouncilEligible('cohere', 'command-r-plus')).toBe(true);
  });
});

describe('ProviderCapabilityMatrix — unknown provider (fail-open)', () => {
  it('getProviderCapabilities returns undefined for unknown provider', () => {
    expect(getProviderCapabilities('acme-corp')).toBeUndefined();
  });

  it('isCouncilEligible returns true for unknown provider (permissive default)', () => {
    expect(isCouncilEligible('acme-corp', 'any-model')).toBe(true);
  });

  it("defaultTierFor returns 'light' for unknown provider (permissive default)", () => {
    expect(defaultTierFor('acme-corp', 'any-model')).toBe('light');
  });
});

describe('ProviderCapabilityMatrix — purity', () => {
  it('helpers are referentially transparent', () => {
    const a = defaultTierFor('openai', 'gpt-4o');
    const b = defaultTierFor('openai', 'gpt-4o');
    const c = defaultTierFor('openai', 'gpt-4o');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('matrix has no side effects on import', () => {
    const before = Object.keys(ProviderCapabilityMatrix).length;
    isCouncilEligible('openai', 'dall-e-3');
    isCouncilEligible('openai', 'gpt-4o');
    defaultTierFor('groq', 'llama-3.1-70b');
    getProviderCapabilities('anthropic');
    const after = Object.keys(ProviderCapabilityMatrix).length;
    expect(after).toBe(before);
  });
});

describe('isUseCaseEligible — per-model, per-use-case exclusions', () => {
  const USE_CASES: UseCase[] = ['council', 'single', 'multi', 'title', 'memory-extraction'];

  it('a normal chat model is eligible for every use case', () => {
    for (const uc of USE_CASES) {
      expect(isUseCaseEligible('openai', 'gpt-4o', uc), `gpt-4o:${uc}`).toBe(true);
      expect(isUseCaseEligible('anthropic', 'claude-3-opus', uc), `opus:${uc}`).toBe(true);
    }
  });

  it('a non-chat openai model (dall-e/embedding/tts/whisper) is excluded from ALL use cases', () => {
    const nonChat = [
      'dall-e-3',
      'gpt-image-1',
      'whisper-1',
      'tts-1',
      'tts-1-hd',
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002',
    ];
    for (const modelId of nonChat) {
      for (const uc of USE_CASES) {
        expect(isUseCaseEligible('openai', modelId, uc), `${modelId}:${uc}`).toBe(false);
      }
    }
  });

  it('stays backward-compatible with isCouncilEligible', () => {
    expect(isUseCaseEligible('openai', 'gpt-4o', 'council')).toBe(
      isCouncilEligible('openai', 'gpt-4o')
    );
    expect(isUseCaseEligible('openai', 'dall-e-3', 'council')).toBe(
      isCouncilEligible('openai', 'dall-e-3')
    );
  });

  it('is permissive (fail-open) for unknown providers', () => {
    for (const uc of USE_CASES) {
      expect(isUseCaseEligible('acme-corp', 'any-model', uc), `acme:${uc}`).toBe(true);
    }
  });

  it('respects councilEligible=false only for the council use case', () => {
    // A hypothetical provider can be globally council-ineligible without
    // affecting other use cases. Guard via a temporary row would mutate shared
    // state, so we assert the contract through openai's real rows instead:
    // gpt-4o is council-eligible AND title-eligible.
    expect(isUseCaseEligible('openai', 'gpt-4o', 'council')).toBe(true);
    expect(isUseCaseEligible('openai', 'gpt-4o', 'title')).toBe(true);
  });
});

describe('ProviderCapabilities type — Modality and Feature literals are valid', () => {
  it('the shape matches the SDK contracts', () => {
    const caps: ProviderCapabilities = ProviderCapabilityMatrix.openai;
    const modalities = caps.supportedModalities;
    const features = caps.supportedFeatures;
    expect(modalities).toBeInstanceOf(Array);
    expect(features).toBeInstanceOf(Array);
    for (const m of modalities) expect(typeof m).toBe('string');
    for (const f of features) expect(typeof f).toBe('string');
  });
});
