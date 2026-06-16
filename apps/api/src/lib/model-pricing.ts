/**
 * Model pricing module.
 *
 * Fetches live pricing from OpenRouter's public API with a 1-hour in-memory
 * cache. Falls back to a static map of common models if the fetch fails.
 *
 * Cost calculation: (inputTokens * inputPrice) + (outputTokens * outputPrice)
 */

interface ModelPrice {
  inputPrice: number; // USD per input token
  outputPrice: number; // USD per output token
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let pricingCache = new Map<string, ModelPrice>();
let cacheTimestamp = 0;
let fetchPromise: Promise<void> | null = null;

/**
 * Static fallback prices for common models.
 * Prices are in USD per token.
 */
const STATIC_PRICES: Map<string, ModelPrice> = new Map([
  // OpenAI
  ['openai:gpt-4o', { inputPrice: 0.0000025, outputPrice: 0.00001 }],
  ['openai:gpt-4o-mini', { inputPrice: 0.00000015, outputPrice: 0.0000006 }],
  ['openai:o3-mini', { inputPrice: 0.0000011, outputPrice: 0.0000044 }],
  ['openai:gpt-4-turbo', { inputPrice: 0.00001, outputPrice: 0.00003 }],
  ['openai:gpt-4', { inputPrice: 0.00003, outputPrice: 0.00006 }],
  ['openai:gpt-3.5-turbo', { inputPrice: 0.0000005, outputPrice: 0.0000015 }],

  // Anthropic
  ['anthropic:claude-3-5-sonnet-20241022', { inputPrice: 0.000003, outputPrice: 0.000015 }],
  ['anthropic:claude-3-opus-20240229', { inputPrice: 0.000015, outputPrice: 0.000075 }],
  ['anthropic:claude-3-haiku-20240307', { inputPrice: 0.00000025, outputPrice: 0.00000125 }],

  // Google
  ['google:gemini-1.5-pro', { inputPrice: 0.00000125, outputPrice: 0.000005 }],
  ['google:gemini-1.5-flash', { inputPrice: 0.000000075, outputPrice: 0.0000003 }],
  ['google:gemini-2.0-flash-exp', { inputPrice: 0.0000001, outputPrice: 0.0000004 }],

  // DeepSeek
  ['deepseek:deepseek-chat', { inputPrice: 0.00000014, outputPrice: 0.00000028 }],
  ['deepseek:deepseek-coder', { inputPrice: 0.00000014, outputPrice: 0.00000028 }],

  // Mistral
  ['mistral:mistral-large', { inputPrice: 0.000002, outputPrice: 0.000006 }],
  ['mistral:mistral-medium', { inputPrice: 0.0000002, outputPrice: 0.0000006 }],
  ['mistral:mistral-small', { inputPrice: 0.0000002, outputPrice: 0.0000006 }],

  // Cohere
  ['cohere:command-r', { inputPrice: 0.0000005, outputPrice: 0.0000015 }],
  ['cohere:command-r-plus', { inputPrice: 0.000003, outputPrice: 0.000015 }],

  // Groq
  ['groq:llama-3.1-70b', { inputPrice: 0.00000059, outputPrice: 0.00000079 }],
  ['groq:llama-3.1-8b', { inputPrice: 0.00000005, outputPrice: 0.00000008 }],
  ['groq:mixtral-8x7b', { inputPrice: 0.00000024, outputPrice: 0.00000024 }],

  // Perplexity
  ['perplexity:sonar', { inputPrice: 0.000001, outputPrice: 0.000001 }],

  // XAI
  ['xai:grok-2', { inputPrice: 0.000002, outputPrice: 0.00001 }],

  // TogetherAI
  ['togetherai:llama-3.1-70b', { inputPrice: 0.00000088, outputPrice: 0.00000088 }],

  // Fireworks
  ['fireworks-ai:llama-3.1-70b', { inputPrice: 0.0000009, outputPrice: 0.0000009 }],

  // OpenRouter
  ['openrouter:anthropic/claude-3.5-sonnet', { inputPrice: 0.000003, outputPrice: 0.000015 }],
]);

/** Normalize OpenRouter model ID to our format */
function normalizeModelId(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Parse a price string from OpenRouter (may be null or "0") */
function parsePrice(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? undefined : parsed;
}

/** Fetch pricing from OpenRouter and populate the cache */
export async function fetchOpenRouterPricing(): Promise<void> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`OpenRouter returned ${res.status}`);
    }

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        pricing?: { prompt?: string | number; completion?: string | number };
      }>;
    };

    const newCache = new Map<string, ModelPrice>();

    for (const model of data.data) {
      if (!model.id || !model.pricing) continue;

      const inputPrice = parsePrice(model.pricing.prompt);
      const outputPrice = parsePrice(model.pricing.completion);

      if (inputPrice !== undefined && outputPrice !== undefined) {
        // OpenRouter IDs are like "anthropic/claude-3.5-sonnet"
        // Convert to our format: "anthropic:claude-3.5-sonnet"
        const normalizedId = model.id.replace('/', ':');
        newCache.set(normalizedId, { inputPrice, outputPrice });
      }
    }

    pricingCache = newCache;
    cacheTimestamp = Date.now();
  } catch (err) {
    // Log but don't throw — callers will use fallback
    console.warn('Failed to fetch OpenRouter pricing:', err instanceof Error ? err.message : err);
  }
}

/** Get price from cache or trigger a refresh if stale */
export async function getLivePrice(
  providerId: string,
  modelId: string
): Promise<ModelPrice | undefined> {
  const key = normalizeModelId(providerId, modelId);

  // Check if cache is fresh
  if (Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    const cached = pricingCache.get(key);
    if (cached) return cached;
  }

  // Cache miss or stale — trigger fetch (deduplicated)
  if (!fetchPromise) {
    fetchPromise = fetchOpenRouterPricing().finally(() => {
      fetchPromise = null;
    });
  }
  await fetchPromise;

  return pricingCache.get(key);
}

/**
 * Get the best available price for a model.
 * Tries: live cache → static fallback → default estimate
 */
export async function getModelPrice(providerId: string, modelId: string): Promise<ModelPrice> {
  const key = normalizeModelId(providerId, modelId);

  // 1. Try live cache
  const live = await getLivePrice(providerId, modelId);
  if (live) return live;

  // 2. Try static fallback
  const staticPrice = STATIC_PRICES.get(key);
  if (staticPrice) return staticPrice;

  // 3. Fuzzy match: try finding a static price where the key contains the modelId
  for (const [staticKey, price] of STATIC_PRICES) {
    if (staticKey.includes(modelId) || modelId.includes(staticKey.split(':')[1] ?? '')) {
      return price;
    }
  }

  // 4. Default estimate
  return { inputPrice: 0.000001, outputPrice: 0.000003 };
}

/** Calculate estimated cost for a usage record */
export function calculateCost(
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  price: ModelPrice
): number {
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return input * price.inputPrice + output * price.outputPrice;
}

/** Initialize pricing on boot (fire-and-forget) */
export async function initializePricing(): Promise<void> {
  await fetchOpenRouterPricing();
}
