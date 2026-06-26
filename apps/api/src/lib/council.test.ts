import { describe, expect, it } from 'vitest';
import {
  parseVote,
  VoteSchema,
  resolveVoteTarget,
  selectCouncilModels,
  summarizeApproach,
  validateCouncilConfig,
  buildCouncilMembersFromConfig,
  buildConversationContext,
  buildProposalPrompt,
  buildSynthesisPrompt,
  assignCouncilAngles,
  parseProposalSources,
  aggregateConfidence,
  needsCurrentData,
  unwrapWholeAnswerFence,
  COUNCIL_ANGLES,
} from './council';

describe('council helpers', () => {
  describe('unwrapWholeAnswerFence', () => {
    it('unwraps a complete plaintext or markdown fence around a final answer', () => {
      expect(unwrapWholeAnswerFence('```text\n## Respuesta\n\nContenido **visible**.\n```')).toBe(
        '## Respuesta\n\nContenido **visible**.'
      );
      expect(unwrapWholeAnswerFence('```markdown\n# Título\n```')).toBe('# Título');
    });

    it('preserves intentional code blocks and prose with partial fences', () => {
      const codeAnswer = '```ts\nconst answer = 42;\n```';
      const mixedAnswer = 'Explicación:\n\n```text\nEjemplo\n```';

      expect(unwrapWholeAnswerFence(codeAnswer)).toBe(codeAnswer);
      expect(unwrapWholeAnswerFence(mixedAnswer)).toBe(mixedAnswer);
    });
  });

  it('selects one best member per provider, with tier from the matrix', () => {
    const selected = selectCouncilModels([
      {
        provider: 'openai',
        modelId: 'gpt-5.4',
        reasoning: true,
        toolCall: true,
        contextWindow: 200000,
      },
      { provider: 'openai', modelId: 'gpt-5.4-mini', toolCall: true, contextWindow: 128000 },
      { provider: 'deepseek', modelId: 'deepseek-v4-pro', reasoning: true, contextWindow: 128000 },
      { provider: 'deepseek', modelId: 'deepseek-v4-flash', contextWindow: 64000 },
    ]);

    expect(selected).toHaveLength(2);
    expect(selected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'openai', modelId: 'gpt-5.4', tier: 'strong' }),
        expect.objectContaining({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          tier: 'strong',
        }),
      ])
    );
  });

  it('picks the highest-scored model per provider (reasoning + contextWindow)', () => {
    const selected = selectCouncilModels([
      { provider: 'openai', modelId: 'gpt-4o', toolCall: true, contextWindow: 128000 },
      {
        provider: 'openai',
        modelId: 'gpt-5.4',
        reasoning: true,
        toolCall: true,
        contextWindow: 200000,
      },
      { provider: 'openai', modelId: 'gpt-5.4-mini', toolCall: true, contextWindow: 128000 },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].modelId).toBe('gpt-5.4');
  });

  it("excludes models listed in the matrix's councilIneligibleModelIds", () => {
    const selected = selectCouncilModels([
      { provider: 'openai', modelId: 'gpt-image-1', contextWindow: 32000 },
      { provider: 'openai', modelId: 'gpt-5.4', reasoning: true, contextWindow: 200000 },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].modelId).toBe('gpt-5.4');
  });

  it('excludes image-only / embedding / TTS models (matrix-based, no substring hints)', () => {
    const selected = selectCouncilModels([
      { provider: 'openai', modelId: 'dall-e-3', contextWindow: 4000 },
      { provider: 'openai', modelId: 'whisper-1', contextWindow: 0 },
      { provider: 'openai', modelId: 'text-embedding-3-small', contextWindow: 8000 },
      { provider: 'openai', modelId: 'gpt-5.4', reasoning: true, contextWindow: 200000 },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].modelId).toBe('gpt-5.4');
  });

  it('accepts an OpenRouter custom model without matching any name hint', () => {
    const selected = selectCouncilModels([
      { provider: 'openrouter', modelId: 'vendor/foo', contextWindow: 128000 },
      { provider: 'openai', modelId: 'gpt-4o', toolCall: true, contextWindow: 128000 },
    ]);
    expect(selected).toHaveLength(2);
    expect(selected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'openrouter', modelId: 'vendor/foo' }),
        expect.objectContaining({ provider: 'openai', modelId: 'gpt-4o' }),
      ])
    );
  });

  it("uses the matrix's defaultTier to tag members (openai=strong, groq=light)", () => {
    const selected = selectCouncilModels([
      { provider: 'openai', modelId: 'gpt-4o', toolCall: true, contextWindow: 128000 },
      { provider: 'groq', modelId: 'llama-3.1-70b', toolCall: true, contextWindow: 128000 },
      { provider: 'groq', modelId: 'mixtral-8x7b', contextWindow: 32000 },
    ]);
    expect(selected).toHaveLength(2);
    const openai = selected.find((m) => m.provider === 'openai');
    const groq = selected.find((m) => m.provider === 'groq');
    expect(openai?.tier).toBe('strong');
    expect(groq?.tier).toBe('light');
  });

  it('treats an unknown provider as permissive (tier=light, not skipped)', () => {
    const selected = selectCouncilModels([
      { provider: 'acme-corp', modelId: 'any-model', contextWindow: 128000 },
      { provider: 'openai', modelId: 'gpt-4o', toolCall: true, contextWindow: 128000 },
    ]);
    expect(selected).toHaveLength(2);
    const acme = selected.find((m) => m.provider === 'acme-corp');
    expect(acme?.tier).toBe('light');
  });

  it('returns an empty list when there are no candidates', () => {
    const selected = selectCouncilModels([]);
    expect(selected).toEqual([]);
  });

  it('prioritizes toolCall models when the question asks for current data', () => {
    const selected = selectCouncilModels(
      [
        { provider: 'openai', modelId: 'gpt-4o', reasoning: true, contextWindow: 128000 },
        { provider: 'openai', modelId: 'gpt-4o-search', toolCall: true, contextWindow: 128000 },
        { provider: 'deepseek', modelId: 'deepseek-chat', reasoning: true, contextWindow: 128000 },
      ],
      '¿Cuáles son las noticias de hoy?'
    );
    const openai = selected.find((m) => m.provider === 'openai');
    expect(openai?.modelId).toBe('gpt-4o-search');
  });

  it('detects questions that likely need current data', () => {
    expect(needsCurrentData('¿Cuál es el clima de hoy?')).toBe(true);
    expect(needsCurrentData('Últimas noticias de IA 2026')).toBe(true);
    expect(needsCurrentData('¿Cómo funciona un compilador?')).toBe(false);
  });

  it('assigns angles cyclically to models', () => {
    const models = [
      { modelId: 'a' },
      { modelId: 'b' },
      { modelId: 'c' },
      { modelId: 'd' },
      { modelId: 'e' },
      { modelId: 'f' },
      { modelId: 'g' },
    ];
    const angles = assignCouncilAngles(models);
    expect(angles.get('a')).toBe(COUNCIL_ANGLES[0].id);
    expect(angles.get('f')).toBe(COUNCIL_ANGLES[5].id);
    expect(angles.get('g')).toBe(COUNCIL_ANGLES[0].id);
  });

  it('parses verified sources from proposal markdown', () => {
    const content = `
## Fuentes verificadas (si aplica)
- [OpenAI](https://openai.com): líder en IA generativa.
- [Bad entry missing url
- [Anthropic](https://anthropic.com): seguridad en modelos.
    `;
    const sources = parseProposalSources(content);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({
      title: 'OpenAI',
      url: 'https://openai.com',
      snippet: 'líder en IA generativa.',
    });
  });

  it('resolves bracketed vote ids against available models', () => {
    expect(resolveVoteTarget('[gpt-5.4-mini]', ['gpt-5.4', 'gpt-5.4-mini'])).toBe('gpt-5.4-mini');
  });

  it('VoteSchema accepts a well-formed structured vote', () => {
    const parsed = VoteSchema.parse({
      vote: 'gpt-5.4',
      reason: 'equilibrio',
      improvement: 'tabla',
    });
    expect(parsed).toEqual({ vote: 'gpt-5.4', reason: 'equilibrio', improvement: 'tabla' });
  });

  it('VoteSchema accepts a structured vote with confidence and risk', () => {
    const parsed = VoteSchema.parse({
      vote: 'gpt-5.4',
      reason: 'equilibrio',
      improvement: 'tabla',
      confidence: 'high',
      risk: 'costo de inferencia',
    });
    expect(parsed.confidence).toBe('high');
    expect(parsed.risk).toBe('costo de inferencia');
  });

  it('VoteSchema rejects a vote missing required fields', () => {
    expect(VoteSchema.safeParse({ vote: 'gpt-5.4' }).success).toBe(false);
  });

  it('parses vote reason and improvement', () => {
    expect(
      parseVote('VOTO: gpt-5.4\nRAZÓN: mejor equilibrio\nMEJORA: agregar tabla final')
    ).toEqual({
      vote: 'gpt-5.4',
      reason: 'mejor equilibrio',
      improvement: 'agregar tabla final',
    });
  });

  it('parses vote with confidence and risk', () => {
    expect(
      parseVote(
        'VOTO: gpt-5.4\nRAZÓN: mejor equilibrio\nMEJORA: agregar tabla final\nCONFIANZA: medium\nRIESGO: latencia'
      )
    ).toEqual({
      vote: 'gpt-5.4',
      reason: 'mejor equilibrio',
      improvement: 'agregar tabla final',
      confidence: 'medium',
      risk: 'latencia',
    });
  });

  it('aggregates confidence to high only when all votes are high', () => {
    expect(aggregateConfidence(['high', 'high', 'high'])).toBe('high');
    expect(aggregateConfidence(['high', 'medium'])).toBe('medium');
    expect(aggregateConfidence(['medium', 'low'])).toBe('low');
    expect(aggregateConfidence([])).toBe('medium');
  });

  it('extracts a readable approach summary from markdown headings', () => {
    expect(
      summarizeApproach(
        '# Tesis\nArquitectura de transición estructurada con feature flags.\n\n## Plan\n- paso 1'
      )
    ).toBe('Arquitectura de transición estructurada con feature flags.');
  });
});

describe('validateCouncilConfig', () => {
  const textModels = [
    { provider: 'openai', modelId: 'gpt-4o' },
    { provider: 'openai', modelId: 'gpt-4o-mini' },
    { provider: 'deepseek', modelId: 'deepseek-chat' },
    { provider: 'anthropic', modelId: 'claude-3-sonnet' },
  ];

  const connected = new Set(['openai', 'deepseek']);

  it('accepts valid config with ≥2 models and ≥2 providers', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'deepseek:deepseek-chat'],
      connected,
      textModels
    );
    expect(result.valid).toBe(true);
    expect(result.validModels).toEqual(['openai:gpt-4o', 'deepseek:deepseek-chat']);
    expect(result.error).toBeUndefined();
  });

  it('rejects fewer than 2 models', () => {
    const result = validateCouncilConfig(['openai:gpt-4o'], connected, textModels);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('al menos 2 modelos');
  });

  it('rejects more than 8 models', () => {
    const result = validateCouncilConfig(
      Array.from({ length: 9 }, (_, i) => `openai:model-${i}`),
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Máximo 8');
  });

  it('silently drops invalid models and validates remainder', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'deepseek:deepseek-chat', 'unknown:model-x', 'badformat'],
      connected,
      textModels
    );
    expect(result.valid).toBe(true);
    expect(result.validModels).toEqual(['openai:gpt-4o', 'deepseek:deepseek-chat']);
  });

  it('rejects when fewer than 2 providers remain after filtering', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'openai:gpt-4o-mini', 'anthropic:claude-3-sonnet'],
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('al menos 2 proveedores');
  });

  it('rejects when fewer than 2 valid models remain after filtering', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'unknown:model-x'],
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('menos de 2 modelos válidos');
  });

  it('rejects disconnected providers', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'anthropic:claude-3-sonnet'],
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('menos de 2 modelos válidos');
  });

  it('rejects models not in registry', () => {
    const result = validateCouncilConfig(
      ['openai:gpt-4o', 'deepseek:unknown-model'],
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.validModels).toEqual(['openai:gpt-4o']);
  });

  it('rejects when all models are not in registry', () => {
    const result = validateCouncilConfig(
      ['openai:unknown-1', 'deepseek:unknown-2'],
      connected,
      textModels
    );
    expect(result.valid).toBe(false);
    expect(result.validModels).toEqual([]);
    expect(result.error).toContain('menos de 2 modelos válidos');
  });
});

describe('buildCouncilMembersFromConfig', () => {
  const textModels = [
    {
      provider: 'openai',
      modelId: 'gpt-4o',
      contextWindow: 128000,
      reasoning: true,
      toolCall: true,
      structuredOutput: false,
    },
    { provider: 'deepseek', modelId: 'deepseek-chat', contextWindow: 64000 },
  ];

  it('builds members with strong tier for all selected models', () => {
    const members = buildCouncilMembersFromConfig(
      ['openai:gpt-4o', 'deepseek:deepseek-chat'],
      textModels
    );
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual(
      expect.objectContaining({
        modelId: 'gpt-4o',
        provider: 'openai',
        tier: 'strong',
        contextWindow: 128000,
        reasoning: true,
        toolCall: true,
      })
    );
    expect(members[1]).toEqual(
      expect.objectContaining({
        modelId: 'deepseek-chat',
        provider: 'deepseek',
        tier: 'strong',
      })
    );
  });

  it('carries each model real image capability instead of forcing false', () => {
    const members = buildCouncilMembersFromConfig(
      ['openai:gpt-4o', 'deepseek:deepseek-chat'],
      [
        { provider: 'openai', modelId: 'gpt-4o', attachment: true },
        { provider: 'deepseek', modelId: 'deepseek-chat', attachment: false },
      ]
    );
    expect(members[0].attachment).toBe(true);
    expect(members[1].attachment).toBe(false);
  });
});

describe('buildConversationContext (#6 — council inherits chat history)', () => {
  it('returns an empty string when there is no prior history', () => {
    expect(buildConversationContext([])).toBe('');
  });

  it('formats prior user/assistant turns as a labeled transcript', () => {
    const history = buildConversationContext([
      { role: 'user', content: 'Quiero migrar a microservicios' },
      { role: 'assistant', content: 'Empecemos por el dominio de pagos' },
    ]);
    expect(history).toContain('Usuario: Quiero migrar a microservicios');
    expect(history).toContain('Asistente: Empecemos por el dominio de pagos');
  });

  it('ignores non user/assistant roles (e.g. injected system context)', () => {
    const history = buildConversationContext([
      { role: 'system', content: 'Fecha actual: ...' },
      { role: 'user', content: 'Hola' },
    ]);
    expect(history).not.toContain('Fecha actual');
    expect(history).toContain('Usuario: Hola');
  });

  it('caps a very long transcript, keeping the most recent tail', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `mensaje numero ${i} con bastante texto de relleno para inflar el largo`,
    }));
    const history = buildConversationContext(many);
    expect(history.length).toBeLessThanOrEqual(12_500); // cap + truncation marker
    // The tail (most recent) survives; the very first message is dropped.
    expect(history).toContain('mensaje numero 399');
    expect(history).not.toContain('mensaje numero 0 con');
  });
});

describe('council prompts carry conversation context (#6)', () => {
  const HISTORY = 'Usuario: Estábamos diseñando un cache LRU\n\nAsistente: Sí, con TTL de 60s';

  it('buildProposalPrompt embeds the prior history when provided', () => {
    const prompt = buildProposalPrompt('¿Y si lo hacemos distribuido?', 'gpt-5.4', HISTORY);
    expect(prompt).toContain('cache LRU');
    expect(prompt).toContain('¿Y si lo hacemos distribuido?');
  });

  it('buildProposalPrompt stays backward-compatible without history', () => {
    const prompt = buildProposalPrompt('¿Cuál es la capital de Francia?', 'gpt-5.4');
    expect(prompt).toContain('¿Cuál es la capital de Francia?');
    // No history → no "conversación previa" framing leaks in.
    expect(prompt).not.toMatch(/conversaci[oó]n previa/i);
  });

  it('buildProposalPrompt warns text-only members about images they cannot see', () => {
    const prompt = buildProposalPrompt(
      '¿Qué tipo de bolso es este?',
      'deepseek-v4',
      '',
      undefined,
      2
    );
    expect(prompt).toMatch(/2 im[aá]genes/i);
    expect(prompt).toContain('no tenés capacidad visual');
    // It must explicitly tell the model NOT to claim there is no image.
    expect(prompt).toMatch(/no se adjunt[oó] imagen/i);
  });

  it('buildProposalPrompt uses the singular for a single unseen image', () => {
    const prompt = buildProposalPrompt(
      '¿Qué tipo de bolso es este?',
      'deepseek-v4',
      '',
      undefined,
      1
    );
    expect(prompt).toMatch(/1 imagen/i);
    expect(prompt).not.toMatch(/1 im[aá]genes/i);
  });

  it('buildProposalPrompt stays clean when there are no unseen images (vision model)', () => {
    const prompt = buildProposalPrompt('¿Qué tipo de bolso es este?', 'gpt-5.4', '', undefined, 0);
    expect(prompt).not.toMatch(/capacidad visual/i);
  });

  it('buildProposalPrompt injects the assigned angle', () => {
    const prompt = buildProposalPrompt('¿Cómo escalamos el servicio?', 'gpt-5.4', '', 'robust');
    expect(prompt).toContain('Tu perspectiva asignada');
    expect(prompt).toContain('robust');
    expect(prompt).toContain('escalabilidad');
  });

  it('buildProposalPrompt asks for verified sources', () => {
    const prompt = buildProposalPrompt('Pregunta', 'gpt-5.4');
    expect(prompt).toContain('Fuentes verificadas');
    expect(prompt).toContain('- [título](URL): snippet breve');
  });

  it('buildSynthesisPrompt embeds the prior history so the final answer stays coherent', () => {
    const prompt = buildSynthesisPrompt(
      '¿Y si lo hacemos distribuido?',
      'gpt-5.4',
      'Propuesta ganadora...',
      [{ modelId: 'gpt-5.4', vote: 'gpt-5.4', reason: 'r', improvement: 'i' }],
      [{ modelId: 'gpt-5.4', content: '...' }],
      HISTORY
    );
    expect(prompt).toContain('cache LRU');
    expect(prompt).toContain('NO encierres toda la respuesta en un bloque de código');
  });
});
