import type { ChatRequest } from '@chat/sdk';
import type { JSONValue } from 'ai';

type ProviderOptions = Record<string, Record<string, JSONValue>>;
type ProviderFamily = 'openai' | 'openai-compatible' | 'anthropic' | 'google';

export function buildProviderOptions(
  providerId: string,
  family: ProviderFamily,
  request: ChatRequest
): ProviderOptions | undefined {
  if (request.variantOptions && Object.keys(request.variantOptions).length > 0) {
    return namespaceOptions(
      providerId,
      family,
      request.variantOptions as Record<string, JSONValue>
    );
  }

  if (!request.effort || request.effort === 'default') {
    return undefined;
  }
  return undefined;
}

function namespaceOptions(
  providerId: string,
  family: ProviderFamily,
  options: Record<string, JSONValue>
): ProviderOptions {
  if (family === 'openai') return { openai: options };
  if (family === 'anthropic') return { anthropic: options };
  if (family === 'google') return { google: options };

  // @ai-sdk/openai-compatible reads providerOptions from the provider name
  // before the first dot, matching the SDK's providerOptionsName behavior.
  return { [providerId.split('.')[0].trim()]: options };
}
