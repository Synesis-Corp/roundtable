import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  OpenAICompatibleProvider,
  getModelsDevProvider,
} from '@chat/providers';
import type { ProviderPlugin } from '@chat/sdk';
import { createCodexFetch } from './codex-auth';

const providers = new Map<string, ProviderPlugin>();

/** Simple LRU cache with a configurable max size. Evicts the oldest entry
 * (first inserted) when the limit is exceeded — good enough for a provider
 * cache where access frequency roughly follows insertion order. */
export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(key: K): V | undefined {
    return this.map.get(key);
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
  get size(): number {
    return this.map.size;
  }
}

const MAX_DYNAMIC_PROVIDERS = 128;
const dynamicProviders = new LruCache<string, ProviderPlugin>(MAX_DYNAMIC_PROVIDERS);

/** Serializes an options object with sorted keys so the cache key is
 * deterministic regardless of insertion order. */
export function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Known OpenAI-compatible provider base URLs (fallback when Models.dev doesn't provide one) */
const KNOWN_BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  togetherai: 'https://api.together.xyz/v1',
  'fireworks-ai': 'https://api.fireworks.ai/inference/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  perplexity: 'https://api.perplexity.ai',
  cohere: 'https://api.cohere.ai/compatibility/v1',
  xai: 'https://api.x.ai/v1',
  minimax: 'https://api.minimax.chat/v1',
  'minimax-coding-plan': 'https://api.minimax.chat/v1',
  azure: 'https://api.openai.azure.com',
};

/** Maps Models.dev npm packages to provider adapter factory */
function createProviderByNpm(
  id: string,
  npm: string,
  baseURL: string,
  options?: Record<string, unknown>
): ProviderPlugin | undefined {
  // Anthropic SDK providers
  if (npm.includes('@ai-sdk/anthropic')) {
    return new AnthropicProvider({ id, name: id, baseURL });
  }

  // OpenAI SDK providers
  if (npm.includes('@ai-sdk/openai') && !npm.includes('compatible')) {
    const isCodex = options && options.authType === 'codex';
    return new OpenAIProvider({
      id,
      name: id,
      baseURL,
      headers: {
        ...(options?.headers as Record<string, string> | undefined),
        ...(isCodex ? { originator: 'roundtable' } : {}),
      },
      useResponsesApi: isCodex,
      // Codex (ChatGPT Plus/Pro) is reached through the ChatGPT backend's
      // /responses endpoint, but the AI SDK only knows how to call
      // /chat/completions. createCodexFetch() rewrites the URL on the way out
      // and preserves the caller's headers (incl. Authorization and
      // ChatGPT-Account-Id). For api-key providers we leave the default fetch
      // alone so requests hit api.openai.com/v1/chat/completions as before.
      ...(isCodex ? { fetch: createCodexFetch() } : {}),
      // organization/project are null in the Codex path so the SDK omits the
      // OpenAI-Organization and OpenAI-Project headers entirely (passing
      // undefined makes the SDK serialize the literal string "undefined",
      // which ChatGPT rejects).
      organization: null,
      project: null,
    });
  }

  // Google SDK providers
  if (npm.includes('@ai-sdk/google')) {
    return new GoogleProvider({ id, name: id, baseURL });
  }

  // OpenAI-compatible (default fallback)
  return new OpenAICompatibleProvider({
    id,
    name: id,
    baseURL: baseURL ?? 'https://api.openai.com/v1',
    apiEndpoint: typeof options?.endpoint === 'string' ? options.endpoint : undefined,
    headers:
      typeof options?.headers === 'object' &&
      options.headers !== null &&
      !Array.isArray(options.headers)
        ? (options.headers as Record<string, string>)
        : undefined,
    capabilities: [],
  });
}

export function getProvider(
  id: string,
  options?: Record<string, unknown>
): ProviderPlugin | undefined {
  // 1. Check direct registration (built-in providers without options)
  const direct = providers.get(id);
  if (direct && !options) return direct;

  // 2. Check dynamic cache
  const cacheKey = options ? `${id}:${stableStringify(options)}` : id;
  const cached = dynamicProviders.get(cacheKey);
  if (cached) return cached;

  // 3. Look up provider in Models.dev for npm package and API URL
  const modelsDevInfo = getModelsDevProvider(id);
  const npm = modelsDevInfo?.npm ?? '@ai-sdk/openai-compatible';
  const baseURL =
    (options?.baseURL as string) ??
    modelsDevInfo?.api ??
    KNOWN_BASE_URLS[id] ??
    'https://api.openai.com/v1';

  // 4. Create provider based on npm package
  const provider = createProviderByNpm(id, npm, baseURL, options);
  if (provider) {
    dynamicProviders.set(cacheKey, provider);
    return provider;
  }

  return undefined;
}
