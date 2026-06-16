export interface EffortVariant {
  id: string;
  label: string;
  options: Record<string, unknown>;
}

export interface EffortSpec {
  variants: EffortVariant[];
}

export interface EffortModelMetadata {
  apiId?: string;
  npm?: string;
  reasoning?: boolean;
  releaseDate?: string;
  outputLimit?: number;
}

const WIDELY_SUPPORTED_EFFORTS = ['low', 'medium', 'high'];
const OPENAI_NONE_EFFORT_RELEASE_DATE = '2025-11-13';
const OPENAI_XHIGH_EFFORT_RELEASE_DATE = '2025-12-04';
const GPT5_FAMILY_RE = /(?:^|\/)gpt-5(?:[.-]|$)/;

function openAIReasoningEfforts(apiId: string, releaseDate: string): string[] | null {
  const id = apiId.toLowerCase();
  if (id === 'gpt-5-pro' || id === 'openai/gpt-5-pro') return null;
  if (id.includes('codex')) {
    if (id.includes('5.2') || id.includes('5.3')) {
      return [...WIDELY_SUPPORTED_EFFORTS, 'xhigh'];
    }
    return [...WIDELY_SUPPORTED_EFFORTS];
  }

  const efforts = [...WIDELY_SUPPORTED_EFFORTS];
  if (GPT5_FAMILY_RE.test(id)) efforts.unshift('minimal');
  if (releaseDate >= OPENAI_NONE_EFFORT_RELEASE_DATE) efforts.unshift('none');
  if (releaseDate >= OPENAI_XHIGH_EFFORT_RELEASE_DATE) efforts.push('xhigh');
  return efforts;
}

function anthropicAdaptiveEfforts(apiId: string): string[] | null {
  if (['opus-4-7', 'opus-4.7'].some((value) => apiId.includes(value))) {
    return ['low', 'medium', 'high', 'xhigh', 'max'];
  }
  if (['opus-4-6', 'opus-4.6', 'sonnet-4-6', 'sonnet-4.6'].some((value) => apiId.includes(value))) {
    return ['low', 'medium', 'high', 'max'];
  }
  return null;
}

function isOpenCodeExcludedReasoningModel(id: string): boolean {
  return [
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-r1',
    'deepseek-v3',
    'minimax',
    'glm',
    'kimi',
    'k2p',
    'qwen',
    'big-pickle',
  ].some((value) => id.includes(value));
}

function variantsFromEfforts(
  efforts: string[],
  toOptions: (effort: string) => Record<string, unknown>
): EffortSpec | null {
  if (efforts.length === 0) return null;
  return {
    variants: efforts.map((effort) => ({
      id: effort,
      label: effort,
      options: toOptions(effort),
    })),
  };
}

function thinkingBudgetFor(effort: string, outputLimit = 32_000): number | null {
  const budgets: Record<string, number> = {
    low: 4_000,
    medium: 8_000,
    high: 16_000,
    xhigh: 32_000,
    max: 31_999,
  };
  const budget = budgets[effort];
  if (!budget) return null;
  return Math.max(1, Math.min(budget, outputLimit - 1));
}

export function getEffortSpec(
  _provider: string,
  modelId: string,
  metadata?: EffortModelMetadata
): EffortSpec | null {
  if (!metadata?.reasoning) return null;

  const apiId = metadata.apiId ?? modelId;
  const id = `${modelId} ${apiId}`.toLowerCase();
  if (isOpenCodeExcludedReasoningModel(id)) return null;

  const npm = metadata.npm ?? '@ai-sdk/openai-compatible';
  const releaseDate = metadata.releaseDate ?? '';

  if (id.includes('grok') && id.includes('grok-3-mini')) {
    return variantsFromEfforts(['low', 'high'], (effort) => ({ reasoningEffort: effort }));
  }
  if (id.includes('grok')) return null;

  switch (npm) {
    case '@ai-sdk/openai': {
      const efforts = openAIReasoningEfforts(apiId, releaseDate);
      if (!efforts) return null;
      return variantsFromEfforts(efforts, (effort) => ({ reasoningEffort: effort }));
    }

    case '@ai-sdk/anthropic': {
      const efforts = anthropicAdaptiveEfforts(apiId) ?? ['high', 'max'];
      return variantsFromEfforts(efforts, (effort) => {
        const budgetTokens = thinkingBudgetFor(effort, metadata.outputLimit);
        return budgetTokens ? { thinking: { type: 'enabled', budgetTokens } } : {};
      });
    }

    case '@ai-sdk/google': {
      if (id.includes('2.5')) {
        return variantsFromEfforts(['high', 'max'], (effort) => ({
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: effort === 'max' ? 24_576 : 16_000,
          },
        }));
      }

      const levels = id.includes('3.1') ? ['low', 'medium', 'high'] : ['low', 'high'];
      return variantsFromEfforts(levels, (effort) => ({
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: effort,
        },
      }));
    }

    case '@ai-sdk/openai-compatible':
    default: {
      const efforts = [...WIDELY_SUPPORTED_EFFORTS];
      if (apiId.toLowerCase().includes('deepseek-v4')) efforts.push('max');
      return variantsFromEfforts(efforts, (effort) => ({ reasoning_effort: effort }));
    }
  }
}

export function isEffortVariant(
  provider: string,
  modelId: string,
  effort: string,
  metadata?: EffortModelMetadata
): boolean {
  const spec = getEffortSpec(provider, modelId, metadata);
  return spec?.variants.some((variant) => variant.id === effort) ?? false;
}
