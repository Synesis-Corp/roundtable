import type {
  ProviderPlugin,
  ModelCapability,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ToolSet,
  StructuredResponse,
  Modality,
} from '@chat/sdk';
import type { ZodType } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, generateText, generateObject } from 'ai';
import { getModel } from '@chat/router';
import { convertMessages, throwIfErrorPart } from './utils';
import { buildProviderOptions } from './effort';
import { MAX_TOOL_STEPS } from './constants';

/**
 * The @ai-sdk/openai-compatible transport cannot carry `file` content parts: it
 * throws `UnsupportedFunctionalityError("File content parts in user messages")`.
 * The limit is the transport, not the model — so even if a model supports PDF
 * upstream, here we strip `pdf`/`file` from the target modalities. That forces
 * `convertMessages` to inline the PDF's extracted text instead of emitting a
 * file part. Images (`image_url`) are supported, so they stay.
 *
 * Regression: uploading a PDF to a Kimi/Minimax-style model crashed the turn.
 */
export function transportModalities(modalities: Modality[]): Modality[] {
  return modalities.filter((m) => m !== 'pdf' && m !== 'file');
}

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  baseURL: string;
  apiEndpoint?: string; // Custom endpoint path (e.g., "/text/chatcompletion_v2")
  headers?: Record<string, string>;
  capabilities: ModelCapability[];
}

export class OpenAICompatibleProvider implements ProviderPlugin {
  id: string;
  name: string;
  private baseURL: string;
  private apiEndpoint?: string;
  private headers?: Record<string, string>;
  private capabilities: ModelCapability[];

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseURL = config.baseURL;
    this.apiEndpoint = config.apiEndpoint;
    this.headers = config.headers;
    this.capabilities = config.capabilities;
  }

  getCapabilities(): ModelCapability[] {
    return this.capabilities;
  }

  private getClient(apiKey: string) {
    const customFetch =
      this.apiEndpoint || this.headers
        ? async (input: string | URL | Request, init?: RequestInit) => {
            const url = input.toString();
            let modifiedUrl = url;
            let modifiedInit = init;

            // Replace standard endpoint with custom endpoint
            if (this.apiEndpoint) {
              modifiedUrl = url.replace('/chat/completions', this.apiEndpoint);
            }

            // Merge custom headers
            if (this.headers) {
              modifiedInit = {
                ...init,
                headers: {
                  ...(init?.headers ?? {}),
                  ...this.headers,
                },
              };
            }

            return fetch(modifiedUrl, modifiedInit);
          }
        : undefined;

    return createOpenAICompatible({
      name: this.id,
      baseURL: this.baseURL,
      apiKey,
      ...(customFetch ? { fetch: customFetch } : {}),
    });
  }

  async chat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): Promise<ChatResponse> {
    const client = this.getClient(apiKey);
    const start = Date.now();
    const providerOptions = buildProviderOptions(this.id, 'openai-compatible', request);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = transportModalities(
      getModel(this.id, request.model)?.modalities ?? ['text']
    );

    try {
      const result = await generateText({
        model: client(request.model),
        messages: convertMessages(request.messages, { targetModalities }),
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 4096,
        ...(signal ? { abortSignal: signal } : {}),
        ...(providerOptions ? { providerOptions } : {}),
        ...(tools ? { tools } : {}),
        // Multi-step tool loop: the AI SDK needs to call the model again
        // with each tool's result. Default is 1; 5 is the AI SDK's
        // recommended default for tool-enabled chats.
        maxSteps: MAX_TOOL_STEPS,
      });

      return {
        content: result.text,
        model: request.model,
        provider: this.id,
        tokensUsed: result.usage?.totalTokens,
        inputTokens: result.usage?.promptTokens,
        outputTokens: result.usage?.completionTokens,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async chatStructured<T>(
    request: ChatRequest,
    schema: ZodType<T>,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<StructuredResponse<T>> {
    const client = this.getClient(apiKey);
    const start = Date.now();
    const providerOptions = buildProviderOptions(this.id, 'openai-compatible', request);
    const targetModalities = transportModalities(
      getModel(this.id, request.model)?.modalities ?? ['text']
    );
    try {
      const result = await generateObject({
        model: client(request.model),
        schema,
        messages: convertMessages(request.messages, { targetModalities }),
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 4096,
        ...(signal ? { abortSignal: signal } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });
      return {
        object: result.object,
        model: request.model,
        provider: this.id,
        tokensUsed: result.usage?.totalTokens,
        inputTokens: result.usage?.promptTokens,
        outputTokens: result.usage?.completionTokens,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async *streamChat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): AsyncIterable<ChatChunk> {
    const client = this.getClient(apiKey);
    const providerOptions = buildProviderOptions(this.id, 'openai-compatible', request);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = transportModalities(
      getModel(this.id, request.model)?.modalities ?? ['text']
    );

    try {
      const result = await streamText({
        model: client(request.model),
        messages: convertMessages(request.messages, { targetModalities }),
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? 4096,
        ...(signal ? { abortSignal: signal } : {}),
        ...(providerOptions ? { providerOptions } : {}),
        ...(tools ? { tools } : {}),
        // Multi-step tool loop: the AI SDK needs to call the model again
        // with each tool's result. Default is 1; 5 is the AI SDK's
        // recommended default for tool-enabled chats.
        maxSteps: MAX_TOOL_STEPS,
      });

      for await (const part of result.fullStream) {
        const p = part as unknown as { type: string; [k: string]: unknown };
        throwIfErrorPart(p);
        if (p.type === 'text-delta') {
          yield {
            token: p['textDelta'] as string,
            model: request.model,
            provider: this.id,
            isFinished: false,
          };
        } else if (p.type === 'reasoning') {
          yield {
            token: '',
            reasoning: p['textDelta'] as string,
            model: request.model,
            provider: this.id,
            isFinished: false,
          };
        } else if (p.type === 'tool-call') {
          yield {
            token: '',
            toolCall: { name: p['toolName'] as string, args: p['args'] },
            model: request.model,
            provider: this.id,
            isFinished: false,
          };
        } else if (p.type === 'tool-result') {
          yield {
            token: '',
            toolResult: { name: p['toolName'] as string, result: p['result'] },
            model: request.model,
            provider: this.id,
            isFinished: false,
          };
        }
      }

      const usage = await result.usage;

      yield {
        token: '',
        model: request.model,
        provider: this.id,
        isFinished: true,
        usage: usage
          ? {
              inputTokens: usage.promptTokens,
              outputTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            }
          : undefined,
      };
    } catch (error) {
      // Propagate so the caller can decide how to surface the failure (e.g. SSE error event).
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
