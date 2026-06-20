import { describe, expect, it } from 'vitest';
import type { ModelCapability } from '@chat/sdk';
import { MAX_MIXIN_MODELS, buildMixinSynthesisPrompt, selectMixinModels } from './mixin';

const model = (overrides: Partial<ModelCapability>): ModelCapability => ({
  provider: 'openai',
  modelId: 'base',
  modalities: ['text'],
  features: [],
  ...overrides,
});

describe('selectMixinModels', () => {
  it('keeps every eligible model when the user has eight or fewer', () => {
    const models = [
      model({ provider: 'google', modelId: 'flash' }),
      model({ provider: 'openai', modelId: 'gpt', features: ['reasoning'] }),
    ];

    expect(selectMixinModels(models)).toHaveLength(2);
  });

  it('caps a large catalogue deterministically at eight models', () => {
    const models = Array.from({ length: 10 }, (_, index) =>
      model({ provider: 'openai', modelId: `model-${index}`, contextWindow: index })
    );

    const selected = selectMixinModels(models);

    expect(selected).toHaveLength(MAX_MIXIN_MODELS);
    expect(selected.map((candidate) => candidate.modelId)).toEqual([
      'model-9',
      'model-8',
      'model-7',
      'model-6',
      'model-5',
      'model-4',
      'model-3',
      'model-2',
    ]);
  });
});

describe('buildMixinSynthesisPrompt', () => {
  it('keeps provider/model attribution internal and instructs the final pass not to expose it', () => {
    const prompt = buildMixinSynthesisPrompt([
      { provider: 'openai', modelId: 'gpt', content: 'Primera respuesta' },
    ]);

    expect(prompt).toContain('No menciones modelos, fuentes internas ni el proceso de síntesis.');
    expect(prompt).toContain('Fuente interna (openai/gpt):\nPrimera respuesta');
  });
});
