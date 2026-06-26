import { describe, expect, it } from 'vitest';
import type { Message, ModelCapability } from '@chat/sdk';
import {
  MAX_MIXIN_MODELS,
  buildMixinSynthesisPrompt,
  selectMixinModels,
  stripImagesForTextOnly,
} from './mixin';

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

describe('stripImagesForTextOnly', () => {
  const withImage = (): Message[] => [
    { role: 'system', content: 'contexto' },
    {
      role: 'user',
      content: '¿Qué tipo de bolso es este?',
      attachments: [
        {
          type: 'image',
          base64: 'data:image/png;base64,AAA',
          mimeType: 'image/png',
          name: 'bag.png',
        },
        {
          type: 'pdf',
          base64: 'data:application/pdf;base64,BBB',
          mimeType: 'application/pdf',
          name: 'doc.pdf',
        },
      ],
    },
  ];

  it('returns the same array untouched when there are no images', () => {
    const messages = withImage();
    expect(stripImagesForTextOnly(messages, 0)).toBe(messages);
  });

  it('removes image attachments but keeps non-image ones', () => {
    const result = stripImagesForTextOnly(withImage(), 1);
    const userMessage = result[1];
    expect(userMessage.attachments).toHaveLength(1);
    expect(userMessage.attachments?.[0].type).toBe('pdf');
  });

  it('appends a notice so the model does not claim there is no image', () => {
    const result = stripImagesForTextOnly(withImage(), 2);
    expect(result[1].content).toMatch(/2 im[aá]genes/i);
    expect(result[1].content).toMatch(/no afirmes que no se adjunt[oó] imagen/i);
  });

  it('uses the singular for a single image', () => {
    const result = stripImagesForTextOnly(withImage(), 1);
    expect(result[1].content).toMatch(/1 imagen que vos no/i);
  });

  it('leaves messages without attachments alone', () => {
    const result = stripImagesForTextOnly(withImage(), 1);
    expect(result[0]).toEqual({ role: 'system', content: 'contexto' });
  });

  it('drops the attachments field entirely when only images were present', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'mirá esto',
        attachments: [
          {
            type: 'image',
            base64: 'data:image/png;base64,AAA',
            mimeType: 'image/png',
            name: 'a.png',
          },
        ],
      },
    ];
    const result = stripImagesForTextOnly(messages, 1);
    expect(result[0].attachments).toBeUndefined();
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
