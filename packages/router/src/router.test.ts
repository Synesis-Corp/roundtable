import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerModel,
  findCapableModels,
  clearRegistry,
  route,
  getEffortSpec,
} from '../src/index';

describe('router', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and finds capable models', () => {
    registerModel({
      modelId: 'gpt-4o',
      provider: 'openai',
      modalities: ['text', 'image'],
      features: ['tool-use', 'vision'],
    });

    const models = findCapableModels(['text', 'image'], ['tool-use']);
    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe('gpt-4o');
  });

  it('routes to text fallback when modalities unsupported', () => {
    registerModel({
      modelId: 'gpt-4o',
      provider: 'openai',
      modalities: ['text'],
      features: [],
    });

    const decision = route({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'gpt-4o',
    });

    expect(decision.primary.modelId).toBe('gpt-4o');
  });

  it('enables multi mode when requested', () => {
    registerModel({
      modelId: 'gpt-4o',
      provider: 'openai',
      modalities: ['text'],
      features: [],
    });
    registerModel({
      modelId: 'claude-3',
      provider: 'anthropic',
      modalities: ['text'],
      features: [],
    });

    const decision = route(
      { messages: [{ role: 'user', content: 'hello' }], model: 'gpt-4o' },
      { multiMode: true }
    );

    expect(decision.multiModels).toHaveLength(2);
  });

  it("drops models excluded from 'single' out of default routing", () => {
    registerModel({ modelId: 'gpt-4o', provider: 'openai', modalities: ['text'], features: [] });
    // Embeddings are excludedFrom every use case in the capability matrix.
    registerModel({
      modelId: 'text-embedding-3-small',
      provider: 'openai',
      modalities: ['text'],
      features: [],
    });

    const decision = route({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' });

    const chosen = [decision.primary, ...decision.fallbacks].map((m) => m.modelId);
    expect(decision.primary.modelId).toBe('gpt-4o');
    expect(chosen).not.toContain('text-embedding-3-small');
  });

  it("drops models excluded from 'multi' out of multi mode", () => {
    registerModel({ modelId: 'gpt-4o', provider: 'openai', modalities: ['text'], features: [] });
    registerModel({
      modelId: 'claude-3',
      provider: 'anthropic',
      modalities: ['text'],
      features: [],
    });
    registerModel({
      modelId: 'text-embedding-3-small',
      provider: 'openai',
      modalities: ['text'],
      features: [],
    });

    const decision = route(
      { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' },
      { multiMode: true }
    );

    const multi = decision.multiModels?.map((m) => m.modelId) ?? [];
    expect(multi).not.toContain('text-embedding-3-small');
    expect(multi).toHaveLength(2);
  });

  it('Auto skips a completion-only openrouter model when chat models are available (Post-deploy #1)', () => {
    // User reported: Auto picked `openai/gpt-3.5-turbo-instruct` (completion
    // model) routed through openrouter, surfacing a raw upstream error.
    // The capability matrix must exclude it from single/multi chat routing.
    registerModel({
      modelId: 'openai/gpt-3.5-turbo-instruct',
      provider: 'openrouter',
      modalities: ['text'],
      features: [],
    });
    registerModel({
      modelId: 'anthropic/claude-3-sonnet',
      provider: 'openrouter',
      modalities: ['text'],
      features: ['tool-use'],
    });

    const decision = route({ messages: [{ role: 'user', content: 'hola' }], model: 'gpt-4o' });

    const allPicked = [decision.primary, ...(decision.fallbacks ?? [])].map((m) => m.modelId);
    expect(allPicked).toContain('anthropic/claude-3-sonnet');
    expect(allPicked).not.toContain('openai/gpt-3.5-turbo-instruct');
  });

  it('Auto picks a chat-capable openrouter model even when the completion-only one is alphabetically first (Post-deploy #1)', () => {
    // Alphabetical order is irrelevant — eligibility comes from the matrix.
    registerModel({
      modelId: 'anthropic/claude-3-sonnet',
      provider: 'openrouter',
      modalities: ['text'],
      features: ['tool-use'],
    });
    registerModel({
      modelId: 'openai/davinci-002',
      provider: 'openrouter',
      modalities: ['text'],
      features: [],
    });

    const decision = route({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' });

    expect(decision.primary.modelId).toBe('anthropic/claude-3-sonnet');
  });

  it('ranks Auto candidates by capability instead of registration order', () => {
    registerModel({
      modelId: 'basic-first',
      provider: 'openai',
      modalities: ['text'],
      features: [],
      contextWindow: 8_000,
    });
    registerModel({
      modelId: 'capable-second',
      provider: 'openai',
      modalities: ['text'],
      features: ['reasoning', 'tool-use', 'structured-output'],
      contextWindow: 128_000,
    });

    const decision = route({ messages: [{ role: 'user', content: 'hola' }], model: 'gpt-4o' });

    expect(decision.primary.modelId).toBe('capable-second');
  });

  it('recognizes Spanish reasoning prompts when ranking Auto candidates', () => {
    registerModel({
      modelId: 'plain-first',
      provider: 'openai',
      modalities: ['text'],
      features: [],
    });
    registerModel({
      modelId: 'reasoning-second',
      provider: 'openai',
      modalities: ['text'],
      features: ['reasoning'],
    });

    const decision = route({
      messages: [{ role: 'user', content: 'Explícame por qué esta decisión es mejor.' }],
      model: 'gpt-4o',
    });

    expect(decision.primary.modelId).toBe('reasoning-second');
  });

  it('throws "No capable models available" when only completion-only models are registered (Post-deploy #1)', () => {
    registerModel({
      modelId: 'openai/gpt-3.5-turbo-instruct',
      provider: 'openrouter',
      modalities: ['text'],
      features: [],
    });
    registerModel({
      modelId: 'openai/davinci-002',
      provider: 'openrouter',
      modalities: ['text'],
      features: [],
    });

    // The route() contract: throw a recognizable error so the API endpoint
    // can surface a clear 422 to the user instead of an opaque 500.
    expect(() => route({ messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' })).toThrow(
      /No capable chat models available/
    );
  });

  it('returns model-specific effort variants for OpenAI reasoning models', () => {
    const spec = getEffortSpec('openai', 'gpt-5.5', {
      apiId: 'gpt-5.5',
      npm: '@ai-sdk/openai',
      reasoning: true,
      releaseDate: '2026-04-23',
      outputLimit: 128000,
    });

    expect(spec?.variants.map((variant) => variant.id)).toContain('none');
    expect(spec?.variants.map((variant) => variant.id)).toContain('minimal');
    expect(spec?.variants.map((variant) => variant.id)).toContain('xhigh');
  });

  it('does not expose manual variants for Kimi/Minimax reasoning models', () => {
    expect(
      getEffortSpec('kimi-for-coding', 'kimi-k2-thinking', {
        apiId: 'kimi-k2-thinking',
        npm: '@ai-sdk/anthropic',
        reasoning: true,
        releaseDate: '2025-11',
        outputLimit: 32768,
      })
    ).toBeNull();

    expect(
      getEffortSpec('minimax-coding-plan', 'MiniMax-M2', {
        apiId: 'MiniMax-M2',
        npm: '@ai-sdk/anthropic',
        reasoning: true,
        releaseDate: '2025-10-27',
        outputLimit: 128000,
      })
    ).toBeNull();
  });
});
